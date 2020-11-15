const WebSocket = require("ws");
const http = require("http");
const assert = require("assert");
const uid = require("nuid");
const {
  encode,
  decode,
  encodeError,
  encodeResponse,
  encodeEvent,
} = require("./utils");
const Subscribe = require("./subscriptions");
const highland = require("highland");

module.exports = async (config, libs = {}, emit = (x) => x) => {
  const { actions } = libs;
  const { port, host, channels, ...wsConfig } = config;

  const sessions = new Map();
  const subscriptions = Subscribe();

  const server = http.createServer((req, res) => {
    res.end("ok");
  });

  const wss = new WebSocket.Server({ server, ...wsConfig });

  assert(
    config.channels && config.channels.length,
    "requires at least one channel"
  );

  wss.on("connection", (ws, req) => {
    ws.id = uid.next();
    ws.isAlive = true;
    sessions.set(ws.id, ws);
    subscriptions.join(ws.id, ws);
    ws.batch = Batch(wsConfig, ws);
    emit("connect", ws.id, {
      url: req.url,
      method: req.method,
      upgrade: req.upgrade,
      rawHeaders: req.rawHeaders,
      headers: req.headers,
      httpVersionMajor: req.httpVersionMajor,
      httpVersionMinor: req.httpVersionMinor,
      httpVersion: req.httpVersion,
      complete: req.complete,
    });

    ws.on("message", (data) => {
      ws.isAlive = true;
      if (data == null || data.length == 0) return;
      try {
        var [channel, ...message] = decode(data);
        assert(channels.includes(channel), "Bad Server Channel: " + channel);
        call(ws, channel, message);
      } catch (err) {
        emit("error", err);
      }
    });

    ws.on("close", () => {
      cleanupSession(ws);
      emit("disconnect", ws.id);
    });

    ws.on("error", (err) => {
      console.log(err);
    });
  });

  await new Promise((res, rej) => {
    server.listen({ port, host }, (x) => {
      if (x) return rej(x);
      res();
    });
  });
  wss.on("error", (err) => emit("error", err));

  console.log("openservice-ws open", host + ":" + port);

  function Batch(config, ws) {
    const { parallel = 1, batchTime = 500, batchLength = 50, ...opts } = config;
    const stream = highland();

    stream
      .batchWithTimeOrCount(batchTime, batchLength)
      .map(encode)
      .map((data) => {
        return new Promise((res, rej) =>
          ws.send(data, opts, (err, ok) => {
            if (err) return rej(err);
            res(ok);
          })
        );
      })
      .map(highland)
      .mergeWithLimit(parallel)
      .resume();

    function destroy() {
      stream.destroy();
    }
    function event(...args) {
      stream.write(encodeEvent(...args));
    }
    function error(...args) {
      stream.write(encodeError(...args));
    }
    function response(...args) {
      stream.write(encodeResponse(...args));
    }
    return {
      event,
      error,
      response,
      destroy,
      stream,
    };
  }

  async function call(ws, channel, [id, action, args]) {
    //we need to not run the action if we do not detect the
    //session existing, same on return data
    try {
      assert(actions, "no actions defined");
      const result = await actions(ws.id, channel, action, args);
      if (!sessions.has(ws.id)) return;
      return ws.batch.response(channel, id, result);
    } catch (err) {
      if (!sessions.has(ws.id)) return;
      return ws.batch.error(channel, id, err);
    }
  }

  function unsubscribe(topic, sessionid) {
    subscriptions.leave(topic, sessions.get(sessionid));
  }

  function subscribe(topic, sessionid) {
    subscriptions.join(topic, sessions.get(sessionid));
  }

  function publish(channel, topic, args) {
    subscriptions.publish(topic, channel, args);
  }

  function send(channel, sessionid, args) {
    if (!sessions.has(sessionid)) return;
    sessions.get(sessionid).batch.event(channel, args);
  }

  function closeSession(sessionid) {
    const ws = sessions.get(sessionid);
    // triggers event on websocket to then call cleanup
    ws.terminate();
    ws.close();
  }
  function cleanupSession(ws) {
    ws.batch.destroy();
    sessions.delete(ws.id);
    subscriptions.remove(ws);
  }

  function close() {
    return new Promise((res) => server.close(res));
  }

  function hasSession(sessionid) {
    return sessions.has(sessionid);
  }
  function listSessions() {
    return [...sessions.keys()];
  }

  function cleanup() {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return closeSession(ws.id);
      ws.isAlive = false;
    });
  }

  return {
    publish,
    subscribe,
    unsubscribe,
    send,
    close,
    closeSession,
    hasSession,
    listSessions,
    cleanup,
  };
};
