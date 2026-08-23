//#region Cr Common
import { assert } from "../utils/assert.js";
import { getIo } from "../io/io.js";
import { runtimeUtils, allPrims } from "../runtime/runtime-core.js";
import { isExprTyped, isDeclTyped } from "../syntax/expr.js";
import { prettyFerrum } from "../syntax/pretty-ferrum.js";
import { nilLoc } from "../syntax/token.js";
import { anyT } from "../tree/types.js";
import { CBuilder, codegen_c_stmts, codegen_c_expr, codegen_reprs, primCb } from "./codegen-c.js";
import { codegen_ty_declsJs, codegen_ty_exprJs } from "./codegen-ty.js";
import { codegen8_declsJs, codegen8_exprJs } from "./codegen2.js";
export const codeRunnerNames = ["8", "TY", "C", "NONE"];
// // TODO ? Make it possible to check for code-runner * code-options compatibility before making a code-runner ?
// export type MkCodeRunner2 = {
//     mk: () => CodeRunner
//     isCompatible(co: CodeOptions): boolean
// }
export const codeRunnerMakers = {
    "8": mkCodeRunner8(),
    "TY": mkCodeRunnerTy(),
    "C": mkCodeRunnerC(),
    "NONE": mkCodeRunnerNone(),
};
const standaloneHeader = [
    `import * as rt_core from ${JSON.stringify(import.meta.resolve("../runtime/runtime-core.js"))}`,
    `import * as rt_nodejs from ${JSON.stringify(import.meta.resolve("../runtime/runtime-nodejs.js"))}`,
    `rt_core.addPrimitives(rt_nodejs.primitivesNodeJs)`,
    `const func = function(rt, _) {`
];
const standaloneFooter = [
    `}`,
    `const result = func(rt_core, rt_core.allPrims)`,
    `console.log(JSON.stringify(result))`,
    "", ""
];
//#endregion
//#region Cr 8
export class CodeRunner8 {
    stmtsJs = [];
    exprJs = "";
    func78 = null;
    jsNameSrc;
    jsEnv;
    jsCode;
    io;
    constructor() {
        this.jsEnv = {};
        this.jsNameSrc = { 'id': 1 };
        this.jsCode = [];
        this.io = getIo();
    }
    requirements() {
        return { typesT: false, typesG: false };
    }
    clone() {
        const cr = new CodeRunner8();
        cr.jsEnv = { ...this.jsEnv };
        cr.jsNameSrc = { ...this.jsNameSrc };
        cr.jsCode = [...this.jsCode];
        return cr;
    }
    addDeclsAst(decls) {
        let declsJs = codegen8_declsJs(decls, this.jsEnv, this.jsNameSrc);
        this.jsCode.push(...declsJs);
    }
    cgExpr(expectList) {
        [this.stmtsJs, this.exprJs] = codegen8_exprJs(expectList, this.jsEnv, this.jsNameSrc);
    }
    generateCode() {
        let fnCode78 = [
            `${this.jsCode.join("\n")}`,
            `${this.stmtsJs.join("\n")}`,
            `return (${this.exprJs});`,
            ""
        ].join("\n");
        let standalone = [].concat(standaloneHeader, [fnCode78], standaloneFooter).join("\n");
        this.io.file_write(`gen/test4.js`, standalone);
        this.io.file_write(`gen/test3.js`, fnCode78);
        try {
            this.func78 = new Function('rt', '_', fnCode78);
        }
        catch (exc) {
            throw new Error(`Code Generation Failed ${exc}`);
        }
    }
    runCode() {
        if (this.func78 === null)
            throw new Error("impossible");
        let result78 = this.func78(runtimeUtils, allPrims);
        let actualResults = [];
        while (result78 !== null) {
            let result = runtimeUtils.showValueFerrum(result78[0]);
            actualResults.push(result);
            result78 = result78[1];
        }
        return actualResults;
    }
    evaluateAndShowList(exprs) {
        let expectList = { tag: "EList", exprs: exprs, tail: null, loc: nilLoc };
        this.cgExpr(expectList);
        this.generateCode();
        const results = this.runCode();
        return results;
    }
}
export function mkCodeRunner8() {
    return () => {
        const codeRunner = new CodeRunner8();
        return codeRunner;
    };
}
//#endregion
//#region Cr Ty
export class CodeRunnerTy {
    fnCodeTy = "";
    funcTy;
    jsNameSrcTy;
    jsEnvTy;
    jsCodeTy;
    io;
    constructor() {
        this.jsNameSrcTy = { 'id': 1 };
        this.jsEnvTy = {};
        this.jsCodeTy = [];
        this.io = getIo();
    }
    clone() {
        const cr = new CodeRunnerTy();
        cr.jsNameSrcTy = { ...this.jsNameSrcTy };
        cr.jsEnvTy = { ...this.jsEnvTy };
        cr.jsCodeTy = [...this.jsCodeTy];
        return cr;
    }
    requirements() {
        return { typesT: true, typesG: false };
    }
    addDeclsAst(decls) {
        assert.isTrue(decls.every(d => isDeclTyped(d)), "The TY codegen requires tree-type annotations on the AST.");
        let declsJsTy = codegen_ty_declsJs(decls, this.jsEnvTy, this.jsNameSrcTy);
        this.jsCodeTy.push(...declsJsTy);
    }
    cgExpr(expectList) {
        assert.isTrue(isExprTyped(expectList), "The TY codegen requires tree-type annotations on the AST.");
        let [stmtsJsTy, exprJsTy] = codegen_ty_exprJs(expectList, this.jsEnvTy, this.jsNameSrcTy);
        this.fnCodeTy = [
            `${this.jsCodeTy.join("\n")};`,
            `${stmtsJsTy.join("\n")};`,
            `return (${exprJsTy});`,
            ""
        ].join("\n");
    }
    generateCode() {
        let standaloneTy = [].concat(standaloneHeader, [this.fnCodeTy], standaloneFooter).join("\n");
        this.io.file_write(`gen/test4ty.js`, standaloneTy);
        this.io.file_write(`gen/test3ty.js`, this.fnCodeTy);
        try {
            this.funcTy = new Function('rt', '_', this.fnCodeTy);
        }
        catch (exc) {
            throw new Error(`Code Generation Failed ${exc}`);
        }
    }
    runCode() {
        if (this.funcTy === undefined)
            throw new Error("impossible");
        let resultTy0 = this.funcTy(runtimeUtils, allPrims);
        let resultTy = resultTy0;
        let actualResults = [];
        while (resultTy !== null) {
            let result = runtimeUtils.showValueFerrum(resultTy[0]);
            actualResults.push(result);
            resultTy = resultTy[1];
        }
        return actualResults;
    }
    evaluateAndShowList(exprs) {
        assert.allTrue(isExprTyped, exprs, "The TY codegen requires the AST to be annotated with tree-types.");
        const expectList = { tag: "EList", exprs: exprs, tail: null, loc: nilLoc, ty1: anyT, ty2: anyT, tc: "ok" };
        this.cgExpr(expectList);
        this.generateCode();
        const results = this.runCode();
        return results;
    }
}
export function mkCodeRunnerTy() {
    return () => {
        const codeRunner = new CodeRunnerTy();
        return codeRunner;
    };
}
//#endregion
//#region Cr None
export class CodeRunnerNone {
    io;
    constructor() {
        this.io = getIo();
    }
    requirements() {
        return { typesT: false, typesG: false };
    }
    clone() {
        return new CodeRunnerNone();
    }
    addDeclsAst(decls) {
        // nop
    }
    evaluateAndShowList(exprs) {
        // The "None" code-gen can be used after the expressions 
        //   have been instantiated, fully-reduced, and read-back.
        // This provides a way to check that graph-reduction is fully reducing terms
        let actualResults = [];
        for (let elem of exprs) {
            let result = prettyFerrum(elem);
            actualResults.push(result);
        }
        // console.log("CgNone Expr Expect: ", JSON.stringify(exprs))
        console.log("CgNone Expr Results: ", JSON.stringify(actualResults));
        return actualResults;
    }
}
export function mkCodeRunnerNone() {
    return () => {
        const codeRunner = new CodeRunnerNone();
        return codeRunner;
    };
}
//#endregion
//#region Cr C
class CodeRunnerC {
    stmtsC = [];
    exprC = "";
    funcC;
    io;
    cBuilder;
    constructor() {
        this.cBuilder = new CBuilder();
        this.io = getIo();
    }
    requirements() {
        return { typesT: true, typesG: false };
    }
    clone() {
        const cr = new CodeRunnerC();
        cr.cBuilder = this.cBuilder.clone();
        return cr;
    }
    addDeclsAst(decls) {
        assert.isTrue(decls.every(d => isDeclTyped(d)), "The C codegen requires tree-type annotations on the AST.");
        // codegen_c_stmts(this.cBuilder, decls, this.envBidir)
        codegen_c_stmts(this.cBuilder, decls);
    }
    cgExpr(expectList) {
        assert.isTrue(isExprTyped(expectList)), "The C codegen requires tree-type annotations on the AST.";
        [this.stmtsC, this.exprC] = codegen_c_expr(this.cBuilder, expectList);
    }
    generateCode() {
        codegen_reprs(this.cBuilder);
        let [declsAuxH, declsAuxC, declsUsr, initC] = [this.cBuilder.declsAuxH, this.cBuilder.declsAuxC, this.cBuilder.declsUsr, this.cBuilder.init];
        // const feSrcDir = new URL("../../", import.meta.url).pathname
        // const feSrcDir = rt.getFerrumDir()
        // console.log("feSrcDir", feSrcDir)
        const ferrumDir = process.env["ferrumDir"];
        if (ferrumDir === undefined) {
            throw new Error("The 'ferrumDir' environment variable must be set");
        }
        let testOutputPrefix = "Test Output: ";
        let programCodeC = [
            ``,
            `#include "runtime.h"`,
            ``,
            `/*** Auxiliary Code Header ***/`,
            ``,
            `${declsAuxH.join("\n")}`,
            ``,
            `/*** Auxiliary Code Implementation ***/`,
            ``,
            `${declsAuxC.join("\n")}`,
            ``,
            `/*** Runtime ***/`,
            `#include "runtime.c"`,
            ``,
            `/*** User Code ***/`,
            ``,
            `${declsUsr.join("\n")}`,
            ``,
            `void initGlobals() {`,
            `    ${initC.join("\n    ")}`,
            `}`,
            ``,
            `/*** Main ***/`,
            ``,
            `int main (int argc, const char *argv[]) {`,
            `    initPrimitives(argc, argv);`,
            `    initGlobals();`,
            // `    setFeDir(${JSON.stringify(feSrcDir)});`,
            ``,
            `    ${this.stmtsC.join("\n    ")}`,
            ``,
            `    Any results = ${this.exprC};`,
            `    Any r = results;`,
            `    while (any_isPair(r)) {`,
            `        Any testResult = any_head(r);`,
            `        printf("${testOutputPrefix}%s\\n", showAny(testResult));`,
            `        r = any_tail(r);`,
            `    }`,
            ``,
            `    printDiagnostics();`,
            `    return 0;`,
            `}`,
            ``
        ].join("\n");
        let standaloneC = programCodeC;
        this.io.file_rm("gen/test4c.c");
        this.io.file_write(`gen/test4c.c`, standaloneC);
        // fs.writeFileSync(`gen/test3ty.js`, fnCodeTy)
        // compile the generated code
        try {
            this.io.file_rm("gen/test4c.exe");
            // TODO add -Waddress-sanitize
            let compiler_args = [
                "gcc",
                "-g",
                "-rdynamic", // needed when using printBacktrace
                // "-O3",
                // "-fsanitize=address",
                "-Wall", "-Wno-trigraphs", "-Wno-unused-variable", "-Wno-unused-but-set-variable", "-Wno-unused-label", "-Werror",
                "-o gen/test4c.exe",
                `-I ${ferrumDir}/c/runtime`,
                "-lgc",
                "-lgccpp",
                // "-lgctba",
                "-lstdc++",
                // "-static-libasan",
                // "-lasan",
                // "../../langs/c/runtime.c",
                `${ferrumDir}/c/runtime/ordered-map.cc`,
                "gen/test4c.c"
            ];
            // console.log("COMPILER ARGS:", JSON.stringify(compiler_args))
            this.io.cmd_exec(compiler_args.join(" "));
            this.funcC = () => {
                this.io.file_rm("gen/test4c-output.txt");
                try {
                    let runtime_args = [
                        "gen/test4c.exe",
                        " > gen/test4c-output.txt",
                        " 2> gen/test4c-error.txt"
                    ];
                    this.io.cmd_exec(runtime_args.join(" "));
                }
                catch (exc) {
                    console.log(`Code Generation Failed ${exc}`);
                    // if (td.expected_type_errors === 0) {
                    //     throw new Error(`Code Execution Failed ${exc}`)
                    // }
                    // else 
                    {
                        return undefined;
                    }
                }
                let output = this.io.file_read("gen/test4c-output.txt");
                let result = [];
                output.split("\n").forEach(line => {
                    if (line.startsWith(testOutputPrefix)) {
                        result.push(line.slice(testOutputPrefix.length));
                    }
                });
                return result;
            };
        }
        catch (exc) {
            console.log(`Code Generation Failed ${exc}`);
        }
    }
    runCode() {
        if (this.funcC === undefined)
            throw new Error("impossible");
        let resultC = this.funcC();
        let actualResults = [];
        if (resultC !== undefined) {
            actualResults = resultC;
        }
        return actualResults;
    }
    evaluateAndShowList(exprs) {
        assert.allTrue(isExprTyped, exprs, "The C codegen requires the AST to be annotated with tree-types.");
        const expectList = { tag: "EList", exprs, tail: null, loc: nilLoc, ty1: anyT, ty2: anyT, tc: "ok" };
        this.cgExpr(expectList);
        this.generateCode();
        const results = this.runCode();
        return results;
    }
}
export function mkCodeRunnerC() {
    return () => {
        const codeRunner = new CodeRunnerC();
        codeRunner.cBuilder = primCb.clone();
        codegen_reprs(codeRunner.cBuilder);
        const cr = codeRunner.clone();
        return cr;
    };
}
//#endregion
//# sourceMappingURL=code-runners.js.map