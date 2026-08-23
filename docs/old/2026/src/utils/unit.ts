
// The unit value is the value returned by a function if the function doesn't explicitly return a value.
//
// Due to the way TypeScript works, 
//   using unit rather than void, for function type-signatures,
//   catches mistakenly returning a value from a callback when none is expected.
//
// Typing "undefined" instead of "unit" is misleading, jarring and takes 5 extra characters!
// ( And "void" is a bad name for an inhabited type. )

export type unit = undefined
export const unit = undefined
