


// This diagnostic code works, but returns the locations in the generated JS code, not the TS source code.
// import * as inspector from "node:inspector"
// const inspectorSession = new inspector.Session()
// inspectorSession.connect()
// let objectId
// (globalThis as any).diagnoseMe = signal.callback
// inspectorSession.post('Runtime.evaluate', { expression: 'diagnoseMe' }, (err, params) => {
//     const { result } = params
//     objectId = result.objectId;
// });
// inspectorSession.post('Runtime.getProperties', { objectId }, (err, params) => {
//     const { internalProperties } = params as inspector.Runtime.GetPropertiesReturnType
//     location = (internalProperties as any)[0]?.value?.value
// });



