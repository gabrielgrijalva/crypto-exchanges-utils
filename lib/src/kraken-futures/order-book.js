const KrakenWs = require('@gabrielgrijalva/crypto-exchanges').KrakenFuturesWs;

function snapshotOrderBook(asks, bids, orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
  for (let i = 0; asks[i]; i += 1) {
    const ask = asks[i];
    const askOrder = {};
    askOrder.id = ask.price;
    askOrder.price = ask.price;
    askOrder.size = ask.qty;
    orderBook.asks.push(askOrder);
  }
  for (let i = 0; bids[i]; i += 1) {
    const bid = bids[i];
    const bidOrder = {};
    bidOrder.id = bid.price;
    bidOrder.price = bid.price;
    bidOrder.size = bid.qty;
    orderBook.bids.push(bidOrder);
  }
};
function updateOrderBook(orders, update) {
  let orderIndex = orders.findIndex(v => v.price === update.price);
  if (orderIndex !== -1) {
    if (update.qty) {
      orders[orderIndex].size = update.qty;
    } else {
      orders.splice(orderIndex, 1);
    }
  } else if (update.qty) {
    const order = {};
    order.id = update.price;
    order.price = update.price;
    order.size = update.qty;
    orderIndex = update.side === 'sell' ? orders.findIndex(v => update
      .price < v.price) : orders.findIndex(v => update.price > v.price);
    orders.splice(orderIndex, 0, order);
  }
};

module.exports = function KrakenOrderBook(symbol) {
  let intervalId = 0;
  let connectionCounter = 0;
  let connectingCounter = 0;
  let lastUpdateTimestamp = 0;

  const request = {};
  request.feed = 'book';
  request.event = 'subscribe';
  request.product_ids = [symbol];
  const krakenWs = KrakenWs(request);

  const krakenOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    krakenWs: krakenWs,
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.krakenWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`KrakenOrderBook:${symbol} could not establish`
                + 'initial connection to WebSocket API.');
            }
            return;
          }
          clearInterval(interval);
          resolve();
        }, 500);
      });
    },
    disconnect: function () {
      clearInterval(intervalId);
      this.status = 'disconnected';
      this.krakenWs.disconnect();
    },
    reconnect: function () {
      this.disconnect();
      this.connect();
    }
  };
  function onOpen() {
    console.log(`KrakenOrderBook:${symbol} connection open.`);
    intervalId = setInterval(() => {
      if (krakenOrderBook.status === 'connected') {
        if ((Date.now() - lastUpdateTimestamp) > 60000) {
          krakenOrderBook.disconnect();
          krakenOrderBook.connect();
        }
      }
    }, 5000);
    connectionCounter += 1;
  }
  function onClose() {
    console.log(`KrakenOrderBook:${symbol} connection close.`);
    krakenOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`KrakenOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => krakenOrderBook.krakenWs.connect(), waitSeconds);
  }
  function onError(error) {
    console.log(`KrakenOrderBook:${symbol} connection error.`);
    console.log(error);
    krakenOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`KrakenOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    console.log(messageParsed);
    if (messageParsed.product_id !== symbol) { return };
    if (messageParsed.feed === 'book_snapshot') {
      krakenOrderBook.status = 'connected';
      return snapshotOrderBook(messageParsed.asks, messageParsed
        .bids, krakenOrderBook);
    }
    if (messageParsed.feed === 'book') {
      const orders = messageParsed.side === 'sell' ?
        krakenOrderBook.asks : krakenOrderBook.bids;
      updateOrderBook(orders, messageParsed);
    }
  }

  krakenWs.onOpen(onOpen);
  krakenWs.onClose(onClose);
  krakenWs.onError(onError);
  krakenWs.onMessage(onMessage);

  return krakenOrderBook;
};
