import * as path from "node:path";
import * as fs from "node:fs";
import * as node_process from "node:process";
import * as crypto from "node:crypto";
import { assert } from "../utils/assert.js";
import { mkWui } from "../ui/app-server.js";
import { mkReactive } from "../ui/reactive.js";
export function showAddrInfo(info) {
    const port = info.port;
    const addr = info.address;
    const addr2 = addr.includes(":") ? `[${addr}]` : addr;
    return `${addr2}:${port}`;
}
function mkWuiServerHttp(rctv, wui) {
    const serverId = [node_process.pid, Date.now(), crypto.randomBytes(4).toString('hex')].join("-");
    const sessions = new Map;
    let nextSessionNum = 1;
    let currentSession = null;
    let serverStartTime = Date.now();
    let numRequestsStarted = 0;
    let numRequestsFinished = 0;
    let numReactiveCycles = 0;
    return {
        requestHandler: requestHandler(),
        notify,
    };
    async function handleGet(request, response, session) {
        if (request.url === undefined)
            return;
        const url = new URL(request.url, "http://.");
        const urlp = path.parse(url.pathname);
        if (url.searchParams.get("event-stream") !== null) {
            if (currentSession === null || url.searchParams.get("sessionId") !== currentSession.sessionId) {
                response.statusCode = 409; // Conflict
                response.end();
                return;
            }
            assert.isTrue(request.headers.accept === "text/event-stream");
            response.statusCode = 200;
            response.setHeader("content-type", "text/event-stream");
            response.setHeader("cache-control", "no-cache");
            response.setHeader("connection", "keep-alive");
            currentSession.eventStream = response;
            return;
        }
        if (url.searchParams.size === 0) {
            const body = [
                "<!DOCTYPE html>",
                "<html>",
                "<head>",
                "<meta charset=\"utf-8\">",
                "<link rel='icon' href='data:,'>",
                "<title>",
                "Ferrum WebIDE(TS)",
                "</title>",
                "<style>",
                "html { box-sizing: border-box; }",
                "*, *:before, *:after { box-sizing: inherit; }",
                "body { margin: 0; width: 100vw; height: 100vh; font-family: sans-serif; }",
                "</style>",
                "</head>",
                "<body id=body>",
                "<div id=topDiv></div>",
                "<script type='module'>",
                "  import { initHttp } from '/gen/ui/browser.js'",
                "  initHttp()",
                "</script>",
                "</body>",
                "</html>",
            ].join("\n");
            response.statusCode = 200;
            response.setHeader("content-type", "text/html");
            response.write(body);
            response.end();
            return;
        }
        response.statusCode = 404;
        response.setHeader("content-type", "text/plain");
        response.write(`Unhandled request: (${JSON.stringify(request.url)})`);
        console.log(`Unhandled request: (${JSON.stringify(request.url)})`);
        response.end();
    }
    async function handlePost(request, response, session) {
        if (session === null) {
            // TODO A more appropriate status code.
            response.statusCode = 200;
            response.setHeader("content-type", "text/html");
            response.write("No session.");
            response.end();
            return;
        }
        const bodyChunks = [];
        for await (const chunk of request) {
            bodyChunks.push(chunk);
        }
        const body = Buffer.concat(bodyChunks).toString();
        const req = JSON.parse(body);
        const collectedResponses = [];
        let reqMsgs = req.requests;
        // console.log(`POST ${session.sessionNum} ${body}`)
        wui.exchangeMsgs(reqMsgs, collectedResponses);
        const resp = { responses: collectedResponses };
        if (!session.idSent) {
            resp.serverId = session.serverId;
            resp.sessionId = session.sessionId;
            session.idSent = true;
        }
        const responseBody = JSON.stringify(resp);
        response.statusCode = 200;
        response.setHeader("content-type", "text/html");
        response.write(responseBody);
        response.end();
        // If new delayedEffects have been scheduled, 
        //   then resume the delayed-effect runner.
        // (It might not need resuming, but redundant calls are harmless).
        console.log("handlePost done");
    }
    function notify() {
        if (currentSession !== null && currentSession.eventStream !== undefined) {
            // TODO ? Supress sending redundant notifications ?
            // TODO ?   Resume sending notifications when the earlier ones have been acknowledged ?
            // TODO ? Count how many notifications were supressed, 
            // TODO ?   then use this to auto-tune how much work (such as graph-reduction steps) to do in one go ?
            log("event stream notify");
            const numRequestsInProgress = numRequestsStarted - numRequestsFinished;
            const msg = `ui.log [${showTime()}, ${numRequestsStarted}, ${numRequestsInProgress}, ${numReactiveCycles}]`;
            const dataMsg = `data: notify ${msg}\n\n`;
            // const dataMsg = `data: notify\n\n`
            currentSession.eventStream.write(dataMsg);
            // currentSession.eventStream.write("event: notify\ndata:\n\n")
        }
    }
    function requestHandler() {
        return async (request, response) => {
            numRequestsStarted++;
            try {
                const url = new URL(request.url, "http://.");
                const urlp = path.parse(url.pathname);
                const reqServerId = url.searchParams.get("serverId");
                let reqSessionId = url.searchParams.get("sessionId");
                if (reqServerId !== null && reqServerId !== "unknown" && reqServerId !== serverId) {
                    // The server has been restarted since the client was last in contact.
                    // The client needs to reinitialize.
                    response.statusCode = 409; // Conflict
                    response.end();
                    return;
                }
                if (reqSessionId === "new") {
                    const sessionNum = nextSessionNum++;
                    const newSessionId = `${sessionNum}`;
                    reqSessionId = newSessionId;
                    const newSession = { serverId, sessionId: newSessionId, idSent: false, sessionNum };
                    sessions.set(newSessionId, newSession);
                    currentSession = newSession;
                }
                const session = reqSessionId !== null ? sessions.get(reqSessionId) ?? null : null;
                console.log("Server:", request.method, request.url, request.headers.accept);
                if (session !== null && session !== currentSession) {
                    // Only one (the most recent) session is supported at a time.
                    response.statusCode = 409; // Conflict
                    response.end();
                    return;
                }
                if (request.method === "GET") {
                    // await wui.handleGet(request, response, session)
                    await handleGet(request, response, session);
                }
                else if (request.method === "POST") {
                    // await wui.handlePost(request, response, session)
                    await handlePost(request, response, session);
                }
                else {
                    throw new Error(`unhandled method ${request.method}`);
                }
            }
            catch (exc) {
                console.error(`Server Error: ${exc}`);
                response.statusCode = 500;
                response.end();
                return;
            }
            numRequestsFinished++;
        };
    }
    function showTime() {
        const now = Date.now();
        const t = now - serverStartTime;
        const t2 = Math.floor(t / 100);
        const result = (t2 / 10).toFixed(1);
        return result;
    }
    function log(...args) {
        const numRequestsInProgress = numRequestsStarted - numRequestsFinished;
        console.log(`ui.log [${showTime()}, ${numRequestsStarted}, ${numRequestsInProgress}, ${numReactiveCycles}]:`, ...args);
    }
}
// This appServer returns a request-handler that assumes all requests it will handle are for the app.
// This contrasts with the appServer in ui/app-server-http.ts which handles both static-files and app requests.
// TODO ? Unify the two ?
export function appServer(cmdLine, app) {
    const persistentFilename = "webide.state";
    const persistentState = new Map;
    const appIo = {
        console_log(...args) { console.log(...args); },
        readPersistentFile() {
            let contents = "";
            try {
                contents = fs.readFileSync(persistentFilename).toString();
            }
            catch (exc) {
                console.log(`File not found: (${persistentFilename})`);
                return;
            }
            const lines = contents.split("\n").slice(0, -1);
            for (const line of lines) {
                const [name, value] = JSON.parse(line);
                persistentState.set(name, value);
            }
            return;
        },
        writePersistentFile() {
            const lines = [];
            for (const [key, value] of persistentState.entries()) {
                lines.push(JSON.stringify([key, value]) + "\n");
            }
            const contents = lines.join("");
            // console.log(`Writing state (${lines.length}):`, contents)
            fs.writeFileSync(persistentFilename, contents);
        },
    };
    function notify() {
        wuiServer.notify();
    }
    const rctv = mkReactive(persistentState, msg => { console.log(msg); }, notify);
    const wui = mkWui(persistentState, rctv, appIo);
    const wuiServer = mkWuiServerHttp(rctv, wui);
    const viewNum = wui.allocViewNum();
    const viewCtx = { viewNum, visible: wui.x.state(null, true).r() };
    app.mk(wui, viewCtx, cmdLine.args, appIo);
    wui.initApp(viewNum);
    return wuiServer.requestHandler;
}
//# sourceMappingURL=website-server.js.map