

// import { NodeTag } from "./graph-heap2-impl1.js"
// import { TyCon, TyCon1Tm, TyCon1Ty, TyOp, TyOp0, TyOp1Tm, TyOp1Ty, TyOp2TyTy TyOp1, TyOp2, TyCon1, TmOp1, TmOp2, TmOp } from "../graph/graph-heap2.js"
import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { EnvR, EnvRo, EnvRw, EnvW } from "../utils/env.js"

// TODO ? Fully move away from explicit tags ?
// TODO ? Move over to using the nodeGuide/visitor in the remaining places using tags. ?
export type NodeTag =
    | "TmDatum"
    | "TmPair"
    | "TmApply"
    | "TmLambda"
    | "TmVar"
    | "TmAs"
    | "TmTyAnnot"
    | "TySingleStr"
    | "TyPair"
    | "TyApply"
    | "TyFun"
    | "TyVar"
    | "Prim"


export type Datum = null | boolean | number | string

// reserve negative numbers for other purposes, 10 should be more than sufficient
export type AddrReserved = -1 | -2 | -3 | -4 | -5 | -6 | -7 | -8 | -9 | -10
// -1: AddrNo
// -2: AddrFail
// -3: ArBlocked
// -4: ArFail
// -5: ArMark


export type Addr = Exclude<number, AddrReserved> & { __brand_Addr: never }
export type DirectAddr = Addr & { __Direct: null }
export type AddrIndirect = Addr & { __Indirect: null }
// TODO ? A more refined form of branding ?
// TODO ?   __TorP distinguishes between full terms and patterns within terms
// TODO ?   __TorT distinguishes between terms and types
// TODO ? Cound do with a good word for terms that are not patterns.
// TODO ? Or four distinct words, one for each combination of TorT * TorP
// TODO ? All types are also terms, so TypeAddr is a subtype of TermAddr
// TODO ? Not sure we want TypePatAddr to be a subtype of TermPatAddr, they should probably be disjoint.

export type TermAddr = Addr & { __TorP: "Term" }
export type TermPatAddr = Addr & { __TorP: "Pat" } // TODO ? add (__TorT: "Term"), so as to prevent TypePatAddr being a subtype of TermPatAddr ?
export type TypeAddr = Addr & { __TorP: "Term", __TorT: "Type" }
export type TypePatAddr = Addr & { __TorP: "Pat", __TorT: "Type" }

// "Type" is always at address zero.
export const addrTypeType = 0 as TypeAddr

export type Depth = number & { __brand: "Depth" } // 0 or higher
export const depthZero = 0 as Depth
export type DepthShift = number // -1 or higher (the amount the depth increases by during a substitution)

export function depthInc(depth: Depth, shift: number = 1): Depth {
    return depth + shift as Depth
}
export function depthMax2(a: Depth, b: Depth): Depth {
    return a >= b ? a : b
}
export function depthMax(...depths: Depth[]): Depth {
    let result = depthZero
    for (const depth of depths) {
        result = depth > result ? depth : result
    }
    return result
}

export type Bool = (0 | 1) & { __brand_Bool: never }
export const false0 = 0 as Bool
export const true1 = 1 as Bool
export function booleanToBool(a: boolean): Bool {
    return a ? true1 : false0
}

export type DepthNo = -1 & { __brand_DepthNo: never }
export type DepthMb = Depth | DepthNo
export const depthNo = -1 as DepthNo

export type AddrNo = -1 & { __brand_AddrNo: never }
export type AddrMb = Addr | AddrNo
export type TypeAddrMb = TypeAddr | AddrNo
export const addrNo = -1 as AddrNo

export function isAddrYes(addrMb: AddrMb): addrMb is Addr {
    return addrMb >= 0
}
export function isAddrNo(addrMb: AddrMb): addrMb is AddrNo {
    return addrMb === addrNo
}
// export function addrOr<T extends Addr>(addr1: T | AddrNo, addr2: T): T {
//     return isAddrYes(addr1) ? addr1 : addr2
// } 



// A second level of maybe-ness

export type AddrFail = -2 & { __brand_AddrFail: never }
export type AddrTry = Addr | AddrFail
export type TypeAddrTry = TypeAddr | AddrFail
export type AddrMbTry = AddrMb | AddrFail
export type TypeAddrMbTry = TypeAddrMb | AddrFail
export const addrFail = -2 as AddrFail

export function isAddrOk(addrTry: AddrTry): addrTry is Addr {
    return addrTry !== addrFail
}
export function isAddrMbOk(addrTry: AddrMbTry): addrTry is AddrMb {
    return addrTry !== addrFail
}
export function isAddrFail(addrTry: AddrMbTry): addrTry is AddrFail {
    return addrTry === addrFail
}



/** Address Query: An address being queried, this is used as the argument type to all the is??? functions
    We should always use direct addresses when querying. (unless doing something experimental)
*/
// type AddrQ = Addr
export type AddrQ = DirectAddr

/** Address Answer: An address that has been queried, this is the type of the addr after the query has been answered.
    This asserted in the result type of all the is??? functions (along with further tag-specific intersections).
    This should always be the same as AddrQ. (unless doing something experimental)
*/
export type AddrA = AddrQ
// type AddrA = Addr
// type AddrT = DirectAddr

export type TypeAddrA = TypeAddr & AddrA

export type Addr_of_TySingleStr /**/ = TypeAddrA        /**/ & { __is: "TySingleStr" }

export type Addr_of_TyOp        /**/ = TypeAddrA        /**/ & { __is: "TyOp" }
export type Addr_of_TyOp0       /**/ = Addr_of_TyOp     /**/ & { __args: [] }
export type Addr_of_TyOp1       /**/ = Addr_of_TyOp     /**/ & { __args: ["Type"] }
export type Addr_of_TyOp2       /**/ = Addr_of_TyOp     /**/ & { __args: ["Type", "Type"] }

export type Addr_of_TyPrim      /**/ = TypeAddrA        /**/ & { __is: "TyPrim" }
export type Addr_of_TyPrim0     /**/ = Addr_of_TyPrim   /**/ & { __args: [] }
export type Addr_of_TyPrim1Tm   /**/ = Addr_of_TyPrim   /**/ & { __args: ["Term"] }
export type Addr_of_TyPrim1Ty   /**/ = Addr_of_TyPrim   /**/ & { __args: ["Type"] }
export type Addr_of_TyPrim2TyTm /**/ = Addr_of_TyPrim   /**/ & { __args: ["Type", "Term"] }
export type Addr_of_TyPrim3     /**/ = Addr_of_TyPrim   /**/ & { __args: ["Term", "Term", "Term"] }

export type Addr_of_TyPrim1     /**/ = Addr_of_TyPrim1Tm | Addr_of_TyPrim1Ty
export type Addr_of_TyPrim2     /**/ = Addr_of_TyPrim2TyTm


export type Addr_of_TyCon       /**/ = TypeAddrA        /**/ & { __is: "TyCon" }
export type Addr_of_TyCon1Tm    /**/ = Addr_of_TyCon    /**/ & { __args: ["Term"] }
export type Addr_of_TyCon1Ty    /**/ = Addr_of_TyCon    /**/ & { __args: ["Type"] }
export type Addr_of_TyPair      /**/ = TypeAddrA        /**/ & { __is: "TyPair" }
export type Addr_of_TyApply     /**/ = TypeAddrA        /**/ & { __is: "TyApp" }
export type Addr_of_TyFun       /**/ = TypeAddrA        /**/ & { __is: "TyFun" }
export type Addr_of_TyVar       /**/ = TypeAddrA        /**/ & { __is: "TyVar" }

export type Addr_of_TmLambda    /**/ = AddrA           /**/ & { __is: "TmLam" }
export type Addr_of_TmDatum     /**/ = AddrA           /**/ & { __is: "TmDatum" }
export type Addr_of_TmPair      /**/ = AddrA           /**/ & { __is: "TmPair" }
export type Addr_of_TmApply     /**/ = AddrA           /**/ & { __is: "TmApply" }
export type Addr_of_TmVar       /**/ = AddrA           /**/ & { __is: "TmVar" }
export type Addr_of_TmAs        /**/ = AddrA           /**/ & { __is: "TmAs" }
export type Addr_of_TmPrim      /**/ = AddrA           /**/ & { __is: "TmPrim" }
export type Addr_of_TmPrim0     /**/ = Addr_of_TmPrim  /**/ & { __numArgs: 0 }
export type Addr_of_TmPrim1     /**/ = Addr_of_TmPrim  /**/ & { __numArgs: 1 }
export type Addr_of_TmPrim2     /**/ = Addr_of_TmPrim  /**/ & { __numArgs: 2 }
export type Addr_of_TmPrim3     /**/ = Addr_of_TmPrim  /**/ & { __numArgs: 3 }
export type Addr_of_TmOp        /**/ = AddrA           /**/ & { __is: "TmOp" }
export type Addr_of_TmOp0       /**/ = Addr_of_TmOp    /**/ & { __numArgs: 0 }
export type Addr_of_TmOp1       /**/ = Addr_of_TmOp    /**/ & { __numArgs: 1 }
export type Addr_of_TmOp2       /**/ = Addr_of_TmOp    /**/ & { __numArgs: 2 }
export type Addr_of_TmTyAnnot   /**/ = AddrA           /**/ & { __is: "TmTyAnnot" }


export type Addr_of_Prim = Addr_of_TyOp | Addr_of_TyPrim | Addr_of_TmOp | Addr_of_TmPrim

export type Addr_of_HoleTmp     /**/ = AddrA        /**/ & { __is: "HoleTmp" }
export type Addr_of_HoleBlack   /**/ = AddrA        /**/ & { __is: "HoleBlack" }


export type TypeAddrD = TypeAddr & DirectAddr

export type PathKey = number & { __brand_pathKey: never }
export type PathSegment = number
// export type PathSegment = number | string 
// PathSegment:
//        0 => (hd value)
//       -1 => (tl value)
//      +ve => (listAt segment value)
//      -ve => (listDrop (0 - segment) value) 
//   string => (value segment) // object (intersected function) field access.

export type Path = PathSegment[]

// TODO ? Rename this to NodeVisitor, or perhaps HeapNodeVisitor, or AddrVisitor ?
export type Visitor<T> = {
    tmDatum(addr: Addr_of_TmDatum): T
    tmPair(addr: Addr_of_TmPair): T
    tmApply(addr: Addr_of_TmApply): T
    tmLambda(addr: Addr_of_TmLambda): T
    tmVar(addr: Addr_of_TmVar): T
    tmAs(addr: Addr_of_TmAs): T

    tmTyAnnot(addr: Addr_of_TmTyAnnot): T
    tySingleStr(addr: Addr_of_TySingleStr): T
    tyPair(addr: Addr_of_TyPair): T
    tyApply(addr: Addr_of_TyApply): T
    tyFun(addr: Addr_of_TyFun): T
    tyVar(addr: Addr_of_TyVar): T

    prim(addr: Addr_of_Prim): T

}

export type VisitorWithDefaults<T> = {
    tmDatum?(addr: Addr_of_TmDatum): T
    tmPair?(addr: Addr_of_TmPair): T
    tmApply?(addr: Addr_of_TmApply): T
    tmLambda?(addr: Addr_of_TmLambda): T
    tmVar?(addr: Addr_of_TmVar): T
    tmAs?(addr: Addr_of_TmAs): T
    tmTyAnnot?(addr: Addr_of_TmTyAnnot): T

    tySingleStr?(addr: Addr_of_TySingleStr): T
    tyPair?(addr: Addr_of_TyPair): T
    tyApply?(addr: Addr_of_TyApply): T
    tyFun?(addr: Addr_of_TyFun): T
    tyVar?(addr: Addr_of_TyVar): T

    prim?(addr: Addr_of_Prim): T

    ty?(addr: TypeAddr): T
    tm(addr: Addr): T
}

export type NodeTransformer = {
    depth(depth: Depth): Depth
    type(addr: TypeAddr): TypeAddr
    targetForm(form: TargetForm): TargetForm
    child(addr: Addr): Addr
    childMb(addr: AddrMb): AddrMb
    childTy(addr: TypeAddr): TypeAddr
    childTyMb(addr: TypeAddrMb): TypeAddrMb
}


// TODO ? A non-recursive transformer variant ?
// TODO ? Use an explicit stack instead.
// TODO ? This would require using code to be written differently.
// TODO ? Possible benefits:
// TODO ?   - Avoid stack-overflow
// TODO ?   - Handle back-tracking concerns in the implementation, not the user-code.
// export type TransformWorkItem = {
//     todo: Addr[]
//     done: Addr[]
//     // rebuild: (transformed: Addr[]) => Addr
//     rebuild: (item: TransformWorkItem) => Addr
// }

// export type NodeTransformer2 = {
//     call(addr: Addr): TransformWorkItem
// }

export type NodeTransformerWithDefaults = {
    depth?(depth: Depth): Depth
    type?(addr: TypeAddr): TypeAddr
    targetForm?(form: TargetForm): TargetForm
    child?(addr: Addr): Addr
    childMb?(addr: AddrMb): AddrMb
    childTy?(addr: TypeAddr): TypeAddr
    childTyMb?(addr: TypeAddrMb): TypeAddrMb
}

export type NodeTransformerTry = {
    depth(depth: Depth): Depth
    type(addr: TypeAddr): TypeAddrTry
    targetForm(form: TargetForm): TargetForm
    child(addr: Addr): AddrTry
    childMb(addr: AddrMb): AddrMbTry
    childTy(addr: TypeAddr): TypeAddrTry
    childTyMb(addr: TypeAddrMb): TypeAddrMbTry
}

export type NodeTransformerTryWithDefaults = {
    depth?(depth: Depth): Depth
    type?(addr: TypeAddr): TypeAddrTry
    targetForm?(form: TargetForm): TargetForm
    child?(addr: Addr): AddrTry
    childMb?(addr: AddrMb): AddrMbTry
    childTy?(addr: TypeAddr): TypeAddrTry
    childTyMb?(addr: TypeAddrMb): TypeAddrMbTry
}



export type NodeWalker = {
    // Do we want to walk to the depth and type too ?
    // depth(depth: Depth): Depth
    // type(addr: TypeAddr): TypeAddr
    child(addr: Addr): unit
    // childMb(addr: AddrMb): void
    // childTy(addr: TypeAddr): void
    // childTyMb(addr: TypeAddrMb): void
}

// export type NodeWalkerWithDefaults = {
//     child(addr: Addr): void
//     childMb?(addr: AddrMb): void
//     childTy?(addr: TypeAddr): void
//     childTyMb?(addr: TypeAddrMb): void
// }



export function assumeIsType<A extends Addr>(addr: A): asserts addr is A & TypeAddr {
    return
}
export function assumeIsDirect<A extends Addr>(addr: A): asserts addr is A & DirectAddr {
    return
}


export type Form =
    | "None"
    | "Weak"
    | "Strong"
    | "Error"
    // TODO A separate internal-error category,
    // TODO   for things that currently assert and abort execution.
    // TODO This would make it easier to diagnose internal-errors with the help of the IDE.
    // | "InternalError"

export type TargetForm = Form & ("Weak" | "Strong")
export type ContextForm = Form & ("Weak" | "Strong")
export type ReducedForm = Form & ("Weak" | "Strong" | "Error")

export const formNone = "None" as const
export const formError = "Error" as const
export const formWeak = "Weak" as const
export const formStrong = "Strong" as const

formNone satisfies Form
formError satisfies Form
formWeak satisfies Form
formStrong satisfies Form

export type WorS = "Weak" | "Strong"
export const weak = "Weak"
export const strong = "Strong"

function formToInt(form: Form): number {
    switch (form) {
        case "None": return 0
        case "Weak": return 1
        case "Strong": return 2
        case "Error": return 3
        default: assert.noMissingCases(form)
    }
}

function formFromInt(form: number): Form {
    switch (form) {
        case 0: return "None"
        case 1: return "Weak"
        case 2: return "Strong"
        case 3: return "Error"
        default: assert.unreachable()
    }
}

export function formMin<A extends Form, B extends Form>(a: A, b: B): A | B {
    // if (a === formNone) return a
    // if (b === formNone) return b
    // if (a === formWeak) return a
    // if (b === formWeak) return b
    // if (a === formStrong) return a
    // if (b === formStrong) return b
    // if (a === formError) return a
    // if (b === formError) return b
    // assert.unreachable()

    return formFromInt(Math.min(formToInt(a), formToInt(b))) as A | B
}

export function formMax<A extends Form, B extends Form>(a: A, b: B): A | B {
    // if (a === formError) return a
    // if (b === formError) return b
    // if (a === formStrong) return a
    // if (b === formStrong) return b
    // if (a === formWeak) return a
    // if (b === formWeak) return b
    // if (a === formNone) return a
    // if (b === formNone) return b
    // assert.unreachable()

    return formFromInt(Math.max(formToInt(a), formToInt(b))) as A | B
}

// export function formMerge(a: Form, b: Form): Form {
//     if (a === formError || b === formError) return formError
//     return formMin(a, b)
// }


export function formGte(a: Form, b: Form): boolean {
    return formToInt(a) >= formToInt(b)
}

export function formLt(a: Form, b: Form): boolean {
    return formToInt(a) < formToInt(b)
}

// TODO A more compact form of Form
// type FormReserved = (-1 | -2 | -3) & { __brand_Form: never }
// type FormStrong = Exclude<number, FormReserved> & { __brand_Form: never }
// type FormWeak = -1 & FormReserved 
// type FormNone = -2 & FormReserved 
// type FormError = -3 & FormReserved
// type Form = FormStrong | FormWeak | FormNone | FormError


// Term- vs Type- operators
// Is a type-operator a type-operator because it can only return types ?
// It probably make more sense for a type-operator to be the meaning of an operator used within type-brackets.
// So
//    "&" is only a type-operator, it can only be used in type-brackets. (unless we wish to implement some form of concurrent multiverse pruning)
// And
//    "List" is now a type-primitive, it can only return types.
// But
//    "+" is both a term-operator and type-operator, it can be used in both term and type brackets, meaning depends on TorT bracket context.


// type TyPrimName<T extends string> = T & Capitalize<T>
// type TmPrimName<T extends string> = T & Uncapitalize<T>
// type OpName<T extends string> = T & Capitalize<T> & Uncapitalize<T>
// // let tmPrim: TmPrimName<"abc"> = "abc"
// // let tyPrim: TyPrimName<"Abc"> = "Abc"
// // let op: OpName<"+"> = "+"
// const tyPrimName = <N extends string>(n: TyPrimName<N>) => n
// const tmPrimName = <N extends string>(n: TmPrimName<N>) => n
// const opName = <N extends string>(n: OpName<N>) => n
// let tyPrim = tyPrimName("Abc")
// let tmPrim = tmPrimName("abc")
// let op = opName("+")


// Primitives / 0-arity type-operators
export type TyPrim0 = "Void" | "Nil" | "Bool" | "Int" | "Str" | "Any" | "All" | "Unknown" | "Type" | "Char" | "Error"
export type TyPrim1Tm = "Self" | "Fix" | "Single"
export type TyPrim1Ty = "Dom" | "Cod" | "Hd" | "Tl" | "List" | "Elem"
export type TyPrim2TyTy = "InverseApply"
export type TyPrim2TyTm = "ApplyTyTm"

export type TyPrim1 = TyPrim1Tm | TyPrim1Ty | TyOp1
export type TyPrim2 = TyPrim2TyTy | TyPrim2TyTm | TyOp2
export type TyPrim3 = never

export type TyPrim = TyPrim0 | TyPrim1 | TyPrim2 | TyPrim3


export type TyOp1 = never
// Type operators that take two types as arguments
export type TyOp2_Concrete = "|" | "&" | "\\" | "<:" | ":>"
export type TyOp2 = `{${TyOp2_Concrete}}`

export type TyOp = TyOp1 | TyOp2

// TODO ? Enumerate all the term-primitives ?
export type TmPrim = string

export type TmOp1 = never
export type TmOp2 = "grLoop"
export type TmOp = TmOp1 | TmOp2

export type Prim = TyPrim | TyOp | TmPrim | TmOp

export type GraphEnvR = EnvR<Addr>
export type GraphEnvW = EnvW<Addr>
export type GraphEnvRo = EnvRo<Addr>
export type GraphEnvRw = EnvRw<Addr>

export function isTyOp2Name_Concrete(name: string): name is TyOp2_Concrete {
    switch (name) {
        case "|":
        case "&":
        case "\\":
        case "<:":
        case ":>":
            return true
        default:
            return false
    }
}

export function isTyOp2Name(name: string): name is TyOp2 {
    switch (name) {
        case "{|}":
        case "{&}":
        case "{\\}":
        case "{<:}":
        case "{:>}":
            return true
        default:
            return false
    }
}

export type Heap = {
    directAddrOf<T extends Addr>(addr: T): T & DirectAddr
    indirectAddrsOf(addr: Addr): AddrIndirect[]
    copyWithoutIndirections<A extends Addr>(a: A): A & DirectAddr


    update<A extends DirectAddr, B extends Addr>(addr: A, to: B): unit
    isUpdated<T extends Addr>(addr: T): addr is T & AddrIndirect
    // updatedTo(addr: AddrIndirect & TypeAddr): TypeAddr 
    updatedTo(addr: AddrIndirect): Addr

    // The ...At function return the original non-updated results
    depthAt(addr: Addr): Depth
    typeAt(addr: Addr): TypeAddr
    formAt(addr: Addr): Form

    // The ...Of function now behave exactly the same as the ...At functions
    // It is the callers resposibility to call directAddrOf first if they want to query the latest value.
    depthOf(addr: Addr): Depth
    typeOf(addr: Addr): TypeAddr
    formOf(addr: Addr): Form
    targetFormOf(addr: Addr): TargetForm

    // TODO ? Insist that the ...Of function be called with direct addresses ?
    depthOf(addr: DirectAddr): Depth
    typeOf(addr: DirectAddr): TypeAddr
    formOf(addr: DirectAddr): Form


    isReducedToType(addr: Addr): addr is TypeAddr

    setForm(addr: DirectAddr, form: Form): unit


    // If we ignore the depth, children, and type, are these nodes equal.
    nodeTagAttrsEqual(a: AddrMb, b: AddrMb): boolean

    // TODO Remove direct access to the tags.
    nodeTag(a: DirectAddr): NodeTag
    nodeArity(a: Addr): number
    nodeChild(a: Addr, n: number): AddrMb




    tyVar(depth: Depth, type?: TypeAddrMb, form?: TargetForm): Addr_of_TyVar
    isTyVar(a: AddrQ): a is Addr_of_TyVar


    tyApply(func: TypeAddr, argTy: TypeAddr, depth?: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    isTyApply(ty: Addr): ty is Addr_of_TyApply
    fun_ty(app: Addr_of_TyApply): TypeAddr
    arg_ty(app: Addr_of_TyApply): TypeAddr

    funTy_of(app: Addr_of_TyApply): TypeAddr
    argTy_of(app: Addr_of_TyApply): TypeAddr


    tyFun(no: TypeAddrMb, yes: TypeAddrMb, dom: TypeAddr, cod: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr

    tyPrim0(name: TyPrim0, depth: Depth, type?: TypeAddrMb, form?: TargetForm): Addr_of_TyPrim0
    tyPrim1(name: TyPrim1Tm, arg0: Addr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyPrim1(name: TyPrim1Ty, arg0: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyPrim1(name: TyPrim1, arg0: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyPrim2(name: TyPrim2, arg0: TypeAddr, arg1: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyPrim3(name: TyPrim3, arg0: TypeAddr, arg1: TypeAddr, arg2: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr

    tyOp1(name: TyOp1, arg0: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyOp2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr

    tyCon1(name: TyOp1, arg0: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyCon2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr

    tySingleStr(name: string): Addr_of_TySingleStr
    tyPair(hd: TypeAddr, tl: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyUnion(a: TypeAddr, b: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyIntersect(a: TypeAddr, b: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyRelComp(a: TypeAddr, b: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyHead(pairTy: TypeAddr, depth: DepthMb, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyTail(pairTy: TypeAddr, depth: DepthMb, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyDom(funTy: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyCod(funTy: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr
    tyElem(listTy: TypeAddr, depth: Depth, type?: TypeAddrMb, form?: TargetForm): TypeAddr


    isTySingleStr(a: AddrQ): a is Addr_of_TySingleStr
    value_ty(addr: Addr_of_TySingleStr): string

    isTyPair(a: AddrQ): a is Addr_of_TyPair
    hd_ty(addr: Addr_of_TyPair): TypeAddr
    tl_ty(addr: Addr_of_TyPair): TypeAddr



    // Generic Term/Type Prim/Op primitive/builtin construction and access
    // prim(name: TyPrim, args: Addr[], depth: Depth, type: TypeAddr): Addr_of_TyPrim
    prim(name: Prim, args: Addr[], depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_Prim

    isPrim(name: null, a: AddrQ): a is Addr_of_Prim
    isPrim(name: TyPrim0, a: AddrQ): a is Addr_of_TyPrim0
    isPrim(name: TyPrim1Tm, a: AddrQ): a is Addr_of_TyPrim1Tm
    isPrim(name: TyPrim1Ty, a: AddrQ): a is Addr_of_TyPrim1Ty
    isPrim(name: TyPrim2, a: AddrQ): a is Addr_of_TyPrim2
    isPrim(name: TyPrim3, a: AddrQ): a is Addr_of_TyPrim3
    isPrim(name: TyPrim | null, a: AddrQ): boolean

    isPrim(name: TyOp1, a: AddrQ): a is Addr_of_TyOp1
    isPrim(name: TyOp2, a: AddrQ): a is Addr_of_TyOp2
    isPrim(name: TyOp | null, a: AddrQ): boolean

    isPrim(name: string | null, addr: Addr): addr is Addr_of_TmPrim

    isPrim(name: TmOp1, addr: Addr): addr is Addr_of_TmOp1
    isPrim(name: TmOp2, addr: Addr): addr is Addr_of_TmOp2
    isPrim(name: TmOp | null, addr: Addr): addr is Addr_of_TmOp // TODO ? Return boolean ?

    name_of(addr: Addr_of_TyOp): string
    name_of(addr: Addr_of_TyPrim): string
    name_of(addr: Addr_of_TyOp | Addr_of_TyPrim): string
    name_of(addr: Addr_of_TmOp): string
    name_of(addr: Addr_of_Prim): string

    cons_of(addr: Addr_of_Prim): boolean

    argN_of(n: number, addr: Addr_of_Prim): Addr


    arg0_of(addr: Addr_of_TyPrim1Tm): Addr
    arg0_of(addr: Addr_of_TyPrim1Ty): TypeAddr
    arg0_of(addr: Addr_of_TyOp1 | Addr_of_TyPrim1): TypeAddr
    arg0_of(addr: Addr_of_TyOp2 | Addr_of_TyPrim2): TypeAddr
    arg0_of(addr: Addr_of_TyPrim3): Addr

    arg1_of(addr: Addr_of_TyOp2 | Addr_of_TyPrim2): TypeAddr
    arg1_of(addr: Addr_of_TyPrim3): Addr

    arg2_of(addr: Addr_of_TyPrim3): Addr

    arg0_of(addr: Addr_of_TmPrim): Addr
    arg1_of(addr: Addr_of_TmPrim): Addr
    arg2_of(addr: Addr_of_TmPrim): Addr
    arg0_of(addr: Addr_of_TmOp1): Addr
    arg0_of(addr: Addr_of_TmOp2): Addr
    arg1_of(addr: Addr_of_TmOp2): Addr


    // TyPrim
    isTyPrim(name: null, a: AddrQ): a is Addr_of_TyPrim
    isTyPrim(name: TyPrim0, a: AddrQ): a is Addr_of_TyPrim0
    isTyPrim(name: TyPrim1Tm, a: AddrQ): a is Addr_of_TyPrim1Tm
    isTyPrim(name: TyPrim1Ty, a: AddrQ): a is Addr_of_TyPrim1Ty
    isTyPrim(name: TyPrim2, a: AddrQ): a is Addr_of_TyPrim2
    isTyPrim(name: TyPrim3, a: AddrQ): a is Addr_of_TyPrim3
    isTyPrim(name: TyPrim | null, a: AddrQ): boolean

    isTyOp(name: null, a: AddrQ): a is Addr_of_TyOp
    isTyOp(name: TyOp1, a: AddrQ): a is Addr_of_TyOp1
    isTyOp(name: TyOp2, a: AddrQ): a is Addr_of_TyOp2
    isTyOp(name: TyOp | null, a: AddrQ): boolean

    name_ty(addr: Addr_of_TyOp): string
    name_ty(addr: Addr_of_TyPrim): string
    name_ty(addr: Addr_of_TyOp | Addr_of_TyPrim): string
    name_tm(addr: Addr_of_TmPrim | Addr_of_TmOp): string

    cons_ty(addr: Addr_of_TyOp | Addr_of_TyPrim): boolean

    arg0_ty(addr: Addr_of_TyPrim1Tm): Addr
    arg0_ty(addr: Addr_of_TyPrim1Ty): TypeAddr
    arg0_ty(addr: Addr_of_TyOp1 | Addr_of_TyPrim1): TypeAddr
    arg0_ty(addr: Addr_of_TyOp2 | Addr_of_TyPrim2): TypeAddr
    arg0_ty(addr: Addr_of_TyPrim3): Addr

    arg1_ty(addr: Addr_of_TyOp2 | Addr_of_TyPrim2): TypeAddr
    arg1_ty(addr: Addr_of_TyPrim3): Addr

    arg2_ty(addr: Addr_of_TyPrim3): Addr

    arg0_of(addr: Addr_of_TmPrim): Addr
    arg1_of(addr: Addr_of_TmPrim): Addr
    arg2_of(addr: Addr_of_TmPrim): Addr

    isTyPrimOneOf(name: readonly TyPrim[], a: AddrQ): a is Addr_of_TyPrim
    isTyPrimOneOf2(name: readonly TyPrim[]): (a: AddrQ) => a is Addr_of_TyPrim

    // TyOp
    tyPrim0(name: TyPrim0, depth: Depth, type?: TypeAddrMb, form?: TargetForm): Addr_of_TyPrim0
    isTyOp(name: TyOp, a: Addr): a is Addr_of_TyOp
    isTyOp1(addr: AddrQ): addr is Addr_of_TyOp1
    isTyOp2(addr: AddrQ): addr is Addr_of_TyOp2
    isTyPrim(name: TyPrim, a: Addr): a is Addr_of_TyPrim
    isTyPrim0(addr: AddrQ): addr is Addr_of_TyPrim1
    isTyPrim1(addr: AddrQ): addr is Addr_of_TyPrim1
    isTyPrim2(addr: AddrQ): addr is Addr_of_TyPrim2
    isTyPrim3(addr: AddrQ): addr is Addr_of_TyPrim3
    isTyVoid: (a: AddrQ) => a is Addr_of_TyOp
    isTyNil(a: AddrQ): a is Addr_of_TyOp
    isTyList(a: AddrQ): a is Addr_of_TyOp1
    isTyAny(a: AddrQ): a is Addr_of_TyOp

    hd_tm(addr: Addr_of_TmPair): Addr

    isTyFun(a: AddrQ): a is Addr_of_TyFun
    no_ty(addr: Addr_of_TyFun): TypeAddrMb
    yes_ty(addr: Addr_of_TyFun): TypeAddrMb
    dom_ty(addr: Addr_of_TyFun): TypeAddr
    cod_ty(addr: Addr_of_TyFun): TypeAddr

    tmVar(path: number[], depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmVar
    isTmVar(a: AddrQ): a is Addr_of_TmVar
    path_tm(addr: Addr_of_TmVar): number[]

    // // TODO switch-over to using path-keys
    // tmVar(path: PathKey, depth: Depth, type: TypeAddr): Addr_of_TmVar
    // isTmVar(a: AddrQ): a is Addr_of_TmVar
    // path_tm(addr: Addr_of_TmVar): PathKey

    tmAs(var1: Addr, pat: Addr, depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmAs
    isTmAs(a: AddrQ): a is Addr_of_TmAs
    var_tm(addr: Addr_of_TmAs): Addr
    pat_tm(addr: Addr_of_TmAs): Addr

    // // TODO switch-over to using path-keys
    // tmAs(path: PathKey, pat: Addr, depth: Depth, type: TypeAddr): Addr_of_TmAs
    // isTmAs(a: AddrQ): a is Addr_of_TmAs
    // path_tm(addr: Addr_of_TmAs): PathKey
    // pat_tm(addr: Addr_of_TmAs): Addr


    tmLam(no: Bool, yes: Bool, pat: Addr, body: Addr, depth: Depth, type: TypeAddr, form?: TargetForm): Addr
    isTmLam(a: AddrQ): a is Addr_of_TmLambda
    no_tm(addr: Addr_of_TmLambda): Bool
    yes_tm(addr: Addr_of_TmLambda): Bool
    pat_tm(addr: Addr_of_TmLambda): Addr
    body_tm(addr: Addr_of_TmLambda): Addr

    tmDatum(datum: Datum, depth?: Depth, type?: TypeAddr, form?: TargetForm): Addr_of_TmDatum
    isTmDatum(addr: AddrQ): addr is Addr_of_TmDatum
    datum_tm(addr: Addr_of_TmDatum): Datum

    tmPair(hd: Addr, tl: Addr, depth: Depth, type?: TypeAddr, form?: TargetForm): Addr_of_TmPair
    isTmPair(addr: AddrQ): addr is Addr_of_TmPair
    hd_tm(addr: Addr_of_TmPair): Addr
    tl_tm(addr: Addr_of_TmPair): Addr

    tmApply(fun: Addr, arg: Addr, depth: Depth, type?: TypeAddr, form?: TargetForm): Addr_of_TmApply
    isTmApply(addr: AddrQ): addr is Addr_of_TmApply
    fun_tm(addr: Addr_of_TmApply): Addr
    arg_tm(addr: Addr_of_TmApply): Addr

    // TmPrim
    tmPrim(name: string, args: Addr[], depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmPrim
    isTmPrim(name: string | null, addr: Addr): addr is Addr_of_TmPrim
    isTmPrim0(addr: AddrQ): addr is Addr_of_TmPrim0
    isTmPrim1(addr: AddrQ): addr is Addr_of_TmPrim1
    isTmPrim2(addr: AddrQ): addr is Addr_of_TmPrim2
    isTmPrim3(addr: AddrQ): addr is Addr_of_TmPrim3
    name_tm(addr: Addr_of_TmPrim | Addr_of_TmOp): string
    arg0_tm(addr: Addr_of_TmPrim): Addr
    arg1_tm(addr: Addr_of_TmPrim): Addr
    arg2_tm(addr: Addr_of_TmPrim): Addr

    // TODO ? A more arity-precise version ?
    // tmPrim0(name: string, depth: Depth, type: TypeAddr): Addr_of_TmPrim0
    // tmPrim1(name: string, arg0: Addr, depth: Depth, type: TypeAddr): Addr_of_TmPrim1
    // tmPrim2(name: string, arg0: Addr, arg1: Addr, depth: Depth, type: TypeAddr): Addr_of_TmPrim2
    // tmPrim3(name: string, arg0: Addr, arg1: Addr, arg2: Addr, depth: Depth, type: TypeAddr): Addr_of_TmPrim3
    // isTmPrim(name: TmPrim0, addr: Addr): addr is Addr_of_TmPrim0
    // isTmPrim(name: TmPrim1, addr: Addr): addr is Addr_of_TmPrim1
    // isTmPrim(name: TmPrim2, addr: Addr): addr is Addr_of_TmPrim2
    // isTmPrim(name: TmPrim3, addr: Addr): addr is Addr_of_TmPrim3
    // arg0_tm(addr: Addr_of_TmPrim1): Addr
    // arg0_tm(addr: Addr_of_TmPrim2): Addr
    // arg0_tm(addr: Addr_of_TmPrim3): Addr
    // arg1_tm(addr: Addr_of_TmPrim2): Addr
    // arg1_tm(addr: Addr_of_TmPrim3): Addr
    // arg2_tm(addr: Addr_of_TmPrim3): Addr

    // TmOp
    tmOp0(name: string, depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmOp0
    tmOp1(name: string, arg0: Addr, depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmOp1
    tmOp2(name: string, arg0: Addr, arg1: Addr, depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmOp2
    isTmOp1(addr: AddrQ): addr is Addr_of_TmOp1
    isTmOp2(addr: AddrQ): addr is Addr_of_TmOp2
    isTmOp(name: TmOp1, addr: Addr): addr is Addr_of_TmOp1
    isTmOp(name: TmOp2, addr: Addr): addr is Addr_of_TmOp2
    isTmOp(name: TmOp | null, addr: Addr): addr is Addr_of_TmOp
    name_tm(addr: Addr_of_TmOp): string
    arg0_tm(addr: Addr_of_TmOp1): Addr
    arg0_tm(addr: Addr_of_TmOp2): Addr
    arg1_tm(addr: Addr_of_TmOp2): Addr

    tmTyAnnot(term: Addr, depth: Depth, type: TypeAddr, form?: TargetForm): Addr_of_TmTyAnnot
    isTmTyAnnot(addr: AddrQ): addr is Addr_of_TmTyAnnot
    term_tm(addr: Addr_of_TmTyAnnot): Addr


    pathKey_root: PathKey
    pathKey_next(key: PathKey, segment: PathSegment): PathKey
    pathKey_hd(key: PathKey): PathKey
    pathKey_tl(key: PathKey): PathKey
    pathKey_extend(init: PathKey, next: PathKey): PathKey
    pathKey_path(path: Path): PathKey
    path_pathKey(key: PathKey): Path

    mkVisitor<T>(visitor: VisitorWithDefaults<T>): Visitor<T>

    nodeGuide<T>(visitor: Visitor<T>, addr: Addr): T

    nodeWalk(walker: NodeWalker, Addr: Addr): unit
    nodeWalkOnce(done: Set<Addr>, walker: NodeWalker, addr: Addr): unit


    // TODO Remove the non-try variants of nodeTransform.
    // TODO We always need to be ready to backtrack when cycles are encountered.
    mkNodeTransformer<T>(transformer: NodeTransformerWithDefaults): NodeTransformer

    nodeTransform(transformer: NodeTransformer, addr: Addr): Addr
    nodeTransform(transformer: NodeTransformer, addr: TypeAddr): TypeAddr
    nodeTransformMemoized(memo: Map<Addr, Addr>, transformer: NodeTransformer, addr: Addr): Addr
    nodeTransformMemoized(memo: Map<Addr, Addr>, transformer: NodeTransformer, addr: TypeAddr): TypeAddr

    // TODOn't
    // An explicit stack variant might be useful, 
    // But won't solve the issue with cycles and infinite stack growth.
    // nodeTransform2(transformer: NodeTransformer2, addr: Addr): Addr
    // nodeTransform2(transformer: NodeTransformer2, addr: TypeAddr): TypeAddr
    // nodeTransform2Memoized(memo: Map<Addr, Addr>, transformer: NodeTransformer2, addr: Addr): Addr
    // nodeTransform2Memoized(memo: Map<Addr, Addr>, transformer: NodeTransformer2, addr: TypeAddr): TypeAddr



    mkNodeTransformerTry<T>(transformer: NodeTransformerTryWithDefaults): NodeTransformerTry

    nodeTransformTry(transformer: NodeTransformerTry, addr: Addr): AddrTry
    nodeTransformTry(transformer: NodeTransformerTry, addr: TypeAddr): TypeAddrTry
    nodeTransformMemoizedTry(memo: Map<Addr, AddrTry>, transformer: NodeTransformerTry, addr: Addr): AddrTry
    nodeTransformMemoizedTry(memo: Map<Addr, AddrTry>, transformer: NodeTransformerTry, addr: TypeAddr): TypeAddrTry

    // TODO ? Provide a nodeTransform variant that takes an inStack Set.
    // TODO ?   Implementing the cycle-detection and back-tracking once here, is better than duplicating it.
    // TODO ? Or maybe it would be simplest to embrace cycles.
    // TODO ?   Trying to make things simpler for read-back is making things more complicated elsewhere.
    // TODO ?   So long as cycles always involve a lambda, 
    // TODO ?     a fix-point combinator can be used in a conversion from cyclic to non-cyclic form.
    // TODO ? Or maybe reduction should stop at the point of cycle creation,
    // TODO ?   a reduction that would create a cycle is marked as already reduced.
    // 
    //   - Cycles can only be created due to memoization.
    //   - Memoization was added to help with types.
    //   - Types were the motivation for removing cycles from an earlier version of Ef/Ferrum.
    //   - How very cyclic.


    showNode(addr: Addr): string
    showEntry(addr: Addr): string
    showForm_addr(addr: Addr): string
    // TODO ?
    // show_nodeTag(addr: Addr): string
    // show_nodeAttrs(addr: Addr): [string,Datum][]
    nodeAddrs(addr: Addr): AddrMb[]
    allAddrs(): Addr[]
    chainAddrs(addr: Addr): Addr[]
    heapSize(): number

}

