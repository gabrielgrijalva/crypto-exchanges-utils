const BybitWs = require('@gabrielgrijalva/crypto-exchanges').BybitWs;
const orderBookWss = require('../../shared/order-book-wss');

function snapshotOrderBook(data, orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
  for (let i = 0; data[i]; i += 1) {
    const order = data[i];
    const newOrder = {};
    newOrder.id = +order.price;
    newOrder.price = +order.price;
    newOrder.size = +order.size;
    if (order.side === 'Sell') {
      orderBook.asks.push(newOrder);
    } else {
      orderBook.bids.unshift(newOrder);
    }
  }
};
function updateOrderBook(data, orderBook) {
  for (let i = 0; data.delete[i]; i += 1) {
    const order = data.delete[i];
    const orders = order.side === 'Sell' ? orderBook.asks : orderBook.bids;
    const orderIndex = orders.findIndex(v => v.price === +order.price);
    if (orderIndex !== -1) { orders.splice(orderIndex, 1) };
  }
  for (let i = 0; data.update[i]; i += 1) {
    const order = data.update[i];
    const orders = order.side === 'Sell' ? orderBook.asks : orderBook.bids;
    const orderIndex = orders.findIndex(v => v.price === +order.price);
    if (orderIndex !== -1) {
      orders[orderIndex].size = +order.size;
    } else {
      const newOrder = {};
      newOrder.id = +order.price;
      newOrder.price = +order.price;
      newOrder.size = +order.size;
      const insertIndex = orders.findIndex(v => order.side === 'Sell' ? v.price
        > newOrder.price : v.price < newOrder.price);
      orders.splice(insertIndex, 0, newOrder);
    }
  }
  for (let i = 0; data.insert[i]; i += 1) {
    const order = data.insert[i];
    const orders = order.side === 'Sell' ? orderBook.asks : orderBook.bids;
    const orderIndex = orders.findIndex(v => v.price === +order.price);
    if (orderIndex !== -1) {
      orders[orderIndex].size = +order.size;
    } else {
      const newOrder = {};
      newOrder.id = +order.price;
      newOrder.price = +order.price;
      newOrder.size = +order.size;
      const insertIndex = orders.findIndex(v => order.side === 'Sell' ? v.price
        > newOrder.price : v.price < newOrder.price);
      orders.splice(insertIndex, 0, newOrder);
    }
  }
};

module.exports = function BybitOrderBook(symbol) {
  let intervalId = 0;
  let connectionCounter = 0;
  let connectingCounter = 0;
  let lastUpdateTimestamp = 0;

  const request = {};
  request.op = 'subscribe';
  request.args = [`orderBook_200.100ms.${symbol}`];
  const bybitWs = BybitWs(request);

  const bybitOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    bybitWs: bybitWs,
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.bybitWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`BybitOrderBook:${symbol} could not establish`
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
      this.bybitWs.disconnect();
    },
    reconnect: function () {
      this.disconnect();
      this.connect();
    },
    wss: orderBookWss,
  };
  function onOpen() {
    console.log(`BybitOrderBook:${symbol} connection open.`);
    intervalId = setInterval(() => {
      if (bybitOrderBook.status === 'connected') {
        if ((Date.now() - lastUpdateTimestamp) > 10000) {
          bybitOrderBook.disconnect();
          bybitOrderBook.connect();
        }
      }
    }, 5000);
    connectionCounter += 1;
  }
  function onClose() {
    console.log(`BybitOrderBook:${symbol} connection close.`);
    bybitOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`BybitOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => bybitOrderBook.bybitWs.connect(), waitSeconds);
  }
  function onError(error) {
    console.log(`BybitOrderBook:${symbol} connection error.`);
    console.log(error);
    bybitOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`BybitOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (messageParsed.topic !== request.args[0]) { return };
    if (messageParsed.type === 'snapshot') {
      bybitOrderBook.status = 'connected';
      return snapshotOrderBook(messageParsed.data, bybitOrderBook);
    }
    if (messageParsed.type === 'delta') {
      lastUpdateTimestamp = Date.now();
      updateOrderBook(messageParsed.data, bybitOrderBook);
    }
  }

  bybitWs.onOpen(onOpen);
  bybitWs.onClose(onClose);
  bybitWs.onError(onError);
  bybitWs.onMessage(onMessage);

  return bybitOrderBook;
};
