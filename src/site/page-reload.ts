
// Establish a connection for server sent events.
const sseUrl = new URL(window.location.href)
sseUrl.searchParams.set("event-stream", "")
const sse = new EventSource(sseUrl);

let connectionError = false

sse.addEventListener("reload", (ev) => {
    console.log("SSE reload", ev.data)
    window.location.reload();
});

sse.addEventListener("replace", (ev) => {
    console.log("SSE replace")
    const html = JSON.parse(ev.data)
    document.documentElement.innerHTML = html
    // This has almost the same effect as a page reload.
    // Advantages: it's more direct.
    // Disadvantages: the <script> elements don't get run.
});

sse.addEventListener("close", (ev) => {
    console.log("SSE close")
    sse.close()
});


sse.addEventListener("connected", (ev) => {
    console.log("SSE connected", ev.data)
    // A "connected" message following a connection-error, 
    //   indicates that the connection was lost and is now reestablished.
    // Typically this means that the server has been restarted.
    if (connectionError) {
        // window.location.reload();
        // It is now the server's responsibility to send a reload/replace event,
        //   when a reconnect is detected.
    }
});


sse.addEventListener("error", (ev) => {
    console.log("SSE Error")
    connectionError = true
});

