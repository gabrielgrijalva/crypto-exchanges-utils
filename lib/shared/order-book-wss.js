const Websocket = require('ws');

module.exports = function orderBookWss(settings) {
  const wssParams = {};
  wssParams.port = settings.PORT;
  wssParams.host = settings.HOST;
  wssParams.clientTracking = true;
  const wss = new Websocket.Server(wssParams);
  wss.on('listening', function listening() {
    console.log(`Order Book Websocket Server listening on ${settings.PORT}.`);
  });
  wss.on('connection', function connection(ws) {
    ws.on('ping', () => { ws.pong() });
    console.log('New connection established.');
  });
  wss.on('error', function error() {
    throw new Error('Websocket server connection error...');
  });
  wss.on('close', function close() {
    throw new Error('Websocket server connection closed...');
  });
  setInterval(() => {
    const status = this.status;
    if (status !== 'connected') { return };
    const clients = wss.clients;
    clients.forEach((client) => {
      const message = {};
      message.asks = this.asks.slice(0, settings.BROADCAST_OB_LEVELS_LIMIT);
      message.bids = this.bids.slice(0, settings.BROADCAST_OB_LEVELS_LIMIT)
      message.status = status;
      message.timestamp = Date.now();
      client.send(JSON.stringify(message));
    });
  }, settings.BROADCAST_INTERVAL);
};
