import * as child_process from "node:child_process";
import * as fs from "node:fs";
import { mkIoDoAsyncJs } from "../runtime/runtime-nodejs.js";
const main = () => {
    const cmdLineArgs = process.argv.slice(2);
    const progName = cmdLineArgs[0];
    const cmdOpts = { stdio: [] };
    const prog = child_process.spawn(progName, cmdOpts);
    console.log(`RunIo: child process (${prog.pid})`);
    prog.on("exit", (code) => {
        console.log(`RunIo: child process (${prog.pid}) exited (${code}, ${prog.exitCode})`);
        process.exit(0);
    });
    prog.stderr?.on("data", (data) => {
        console.log(`RunIo StdErr: ${data.slice(0, 80)}`);
    });
    let reqLines = [""];
    const nextLine = () => {
        return new Promise((ok, fail) => {
            if (reqLines.length > 1) {
                let line = reqLines.shift();
                ok(line);
            }
            else {
                prog.stdout?.once("data", (chunk) => {
                    console.log(`RunIo: Chunk (${chunk.slice(0, 80)})`);
                    const reqInput = reqLines[0] + chunk;
                    reqLines = reqInput.split("\n");
                    ok(nextLine());
                });
            }
        });
    };
    const responseLogFile = fs.openSync("response.log", "w");
    const requestLogFile = fs.openSync("request.log", "w");
    const nextReqResp = () => {
        return new Promise((ok, fail) => {
            nextLine().then((line) => {
                console.log(`RunIo: Req ${line.slice(0, 80)}`);
                fs.appendFileSync(requestLogFile, line + "\n");
                let req = JSON.parse(line);
                let kResp = (resp) => {
                    return new Promise((ok, fail) => {
                        const respTxt = JSON.stringify(resp);
                        fs.appendFileSync(responseLogFile, respTxt + "\n");
                        console.log(`RunIo: Resp ${respTxt.slice(0, 80)}`);
                        prog.stdin?.write(respTxt + "\n", () => {
                            ok(nextReqResp());
                        });
                    });
                };
                ok([req, kResp]);
            });
        });
    };
    const ioDo = mkIoDoAsyncJs(cmdLineArgs.slice(1));
    ioDo(nextReqResp());
};
if (process.argv[1] === new URL(import.meta.url).pathname) {
    main();
}
//# sourceMappingURL=run-io.js.map