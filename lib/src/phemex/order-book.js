const PhemexWs = require('@gabrielgrijalva/crypto-exchanges').PhemexWs;
const orderBookWss = require('../../shared/order-book-wss');

function snapshotOrderBook(data, orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
  const insertNewOrderAsk = (newOrder) => orderBook.asks.push(newOrder);
  const insertNewOrderBid = (newOrder) => orderBook.bids.unshift(newOrder);
  ['asks', 'bids'].forEach(v => {
    const insertNewOrder = v === 'asks' ? insertNewOrderAsk : insertNewOrderBid;
    for (let i = 0; data[v][i]; i += 1) {
      const order = data[v][i];
      const orderPx = +order[0] / 10000;
      const orderQty = +order[0];
      const newOrder = {};
      newOrder.id = orderPx;
      newOrder.size = orderQty;
      newOrder.price = orderPx;
      insertNewOrder(newOrder);
    }
  });
};
function findOrderUpdateBidIndex(updatePx, orders) {
  return orders.findIndex(v => updatePx >= v.price);
};
function findOrderUpdateAskIndex(updatePx, orders) {
  return orders.findIndex(v => updatePx <= v.price);
};
function updateOrderBook(data, orderBook) {
  ['asks', 'bids'].forEach(v => {
    const orders = orderBook[v];
    const findOrderUpdateIndex = v === 'asks'
      ? findOrderUpdateAskIndex : findOrderUpdateBidIndex;
    for (let i = 0; data[v][i]; i += 1) {
      const update = data[v][i];
      const updatePx = +update[0] / 10000;
      const updateQty = +update[1];
      const updateIndex = findOrderUpdateIndex(updatePx, orders);
      const orderToUpdate = orders[updateIndex];
      if (orderToUpdate) {
        if (orderToUpdate.price === updatePx) {
          if (!updateQty) {
            orders.splice(updateIndex, 1);
          } else {
            orderToUpdate.size = updateQty;
          }
        } else {
          if (updateQty) {
            orders.splice(updateIndex, 0, { id: updatePx, size: updateQty, price: updatePx, });
          }
        }
      } else {
        if (updateQty) {
          orders.splice(orders.length, 0, { id: updatePx, size: updateQty, price: updatePx, });
        }
      }
    }
  });
};

module.exports = function PhemexOrderBook(symbol) {
  let intervalId = 0;
  let connectionCounter = 0;
  let connectingCounter = 0;
  let lastUpdateTimestamp = 0;

  const config = {};
  config.id = 1;
  config.method = 'orderbook.subscribe';
  config.params = [symbol];
  const phemexWs = PhemexWs(config);

  const phemexOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    phemexWs: phemexWs,
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.phemexWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`PhemexOrderBook:${symbol} could not establish`
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
      this.phemexWs.disconnect();
    },
    reconnect: function () {
      this.disconnect();
      this.connect();
    },
    wss: orderBookWss,
  };
  function onOpen() {
    console.log(`PhemexOrderBook:${symbol} connection open.`);
    intervalId = setInterval(() => {
      if (phemexOrderBook.status === 'connected') {
        if ((Date.now() - lastUpdateTimestamp) > 60000) {
          phemexOrderBook.disconnect();
          phemexOrderBook.connect();
        }
      }
    }, 5000);
    connectionCounter += 1;
  }
  function onClose() {
    console.log(`PhemexOrderBook:${symbol} connection close.`);
    phemexOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`PhemexOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => {
      phemexOrderBook.disconnect();
      phemexOrderBook.connect();
    }, waitSeconds);
  }
  function onError(error) {
    console.log(`PhemexOrderBook:${symbol} connection error.`);
    console.log(error);
    phemexOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`PhemexOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (messageParsed.type === 'snapshot') {
      phemexOrderBook.status = 'connected';
      return snapshotOrderBook(messageParsed.book, phemexOrderBook);
    }
    if (messageParsed.type === 'incremental') {
      lastUpdateTimestamp = Date.now();
      updateOrderBook(messageParsed.book, phemexOrderBook);
    }
  }

  phemexWs.onOpen(onOpen);
  phemexWs.onClose(onClose);
  phemexWs.onError(onError);
  phemexWs.onMessage(onMessage);

  return phemexOrderBook;
};
