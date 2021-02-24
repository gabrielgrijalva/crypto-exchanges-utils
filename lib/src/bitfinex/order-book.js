const BitfinexWs = require('@gabrielgrijalva/crypto-exchanges').BitfinexWs;
const round = require('../../utils/round');
const orderBookWss = require('../../shared/order-book-wss');

/**
 * Function that takes order-book initial data and stores it on BitfinexOrderBook object.
 * @param {Object} updates Received order-book initial data from the WebSocket connection.
 * @param {Object} bitfinexOrderBook BitfinexOrderBook interface object on which data will be stored.
 * @param {Object} orderBookOrders OrderBookOrders interface object on which orders data will be stored.
 */
function synchronizeOrderBook(snapshots, bitfinexOrderBook, orderBookOrders) {
  orderBookOrders.asks.length = 0;
  orderBookOrders.bids.length = 0;
  bitfinexOrderBook.asks.length = 0;
  bitfinexOrderBook.bids.length = 0;
  snapshots.forEach(snapshot => {
    const snapshotType = snapshot[2] < 0 ? 'ask' : 'bid';
    if (snapshotType === 'ask') {
      orderBookOrders.asks.push(snapshot);
    }
    if (snapshotType === 'bid') {
      orderBookOrders.bids.push(snapshot);
    }
  });
  const asksSnapshots = cleanSnapshotOrders(orderBookOrders.asks);
  const bidsSnapshots = cleanSnapshotOrders(orderBookOrders.bids);
  asksSnapshots.forEach(askSnapshot => {
    const ask = {};
    ask.id = +askSnapshot[0];
    ask.price = +askSnapshot[0];
    ask.size = Math.abs(+askSnapshot[1]);
    bitfinexOrderBook.asks.push(ask);
  });
  bidsSnapshots.forEach(bidSnapshot => {
    const bid = {};
    bid.id = +bidSnapshot[0];
    bid.price = +bidSnapshot[0];
    bid.size = Math.abs(+bidSnapshot[1]);
    bitfinexOrderBook.bids.push(bid);
  });
}
/**
 * Takes a given array of asks and updates internal asks.
 * @param {Array} currentAsks Asks to be updated.
 * @param {Array} currentAsksUpdates Asks with update information.
 */
function updateOrders(update, bitfinexOrderBook, orderBookOrders) {
  const orderUpdate = update;
  const orderUpdateType = orderUpdate[2] < 0 ? 'ask' : 'bid';
  const orders = orderUpdateType === 'ask' ? orderBookOrders.asks : orderBookOrders.bids;
  const orderIndex = orders.findIndex(order => orderUpdate[0] === order[0]);
  if (orderIndex === -1 && orderUpdate[1]) {
    const indexToInsertOrder = orders.findIndex(order => {
      if (orderUpdateType === 'ask') {
        return +order[1] >= +orderUpdate[1];
      } else {
        return +order[1] <= +orderUpdate[1];
      }
    });
    orders.splice(indexToInsertOrder !== -1 ? indexToInsertOrder
      : orders.length, 0, orderUpdate);
  } else if (orderIndex !== -1 && +orderUpdate[1] === 0) {
    orders.splice(orderIndex, 1);
  } else if (orderIndex !== -1 && +orderUpdate[1] > 0) {
    orders.splice(orderIndex, 1);
    const indexToInsertOrder = orders.findIndex(order => {
      if (orderUpdateType === 'ask') {
        return +order[1] >= +orderUpdate[1];
      } else {
        return +order[1] <= +orderUpdate[1];
      }
    });
    orders.splice(indexToInsertOrder !== -1 ? indexToInsertOrder
      : orders.length, 0, orderUpdate);
  }

  const cleanedOrders = cleanSnapshotOrders(orders);
  let bitfinexOrders = orderUpdateType === 'ask' ? bitfinexOrderBook.asks
    : bitfinexOrderBook.bids;
  bitfinexOrders.length = 0;
  cleanedOrders.forEach(cleanedSnapshot => {
    const order = {};
    order.id = +cleanedSnapshot[0];
    order.price = +cleanedSnapshot[0];
    order.size = Math.abs(+cleanedSnapshot[1]);
    bitfinexOrders.push(order);
  });

}
/**
 * Function that merges all repeated prices from snapshot array.
 * @param {Array} orders Array of orders to be cleaned.
 */
function cleanSnapshotOrders(orders) {
  const cleanedOrders = [];
  let insertOrder = null;
  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i];
    if (!insertOrder) {
      insertOrder = [order[1], order[2]];
    } else if (insertOrder[0] === order[1]) {
      insertOrder[1] = round.normal(insertOrder[1] + order[2], 8);
    } else {
      cleanedOrders.push(insertOrder);
      insertOrder = [order[1], order[2]];
    }
  }
  cleanedOrders.push(insertOrder);
  return cleanedOrders;
}
/**
 * Create Bitfinex instrument order-book interface.
 * @param {string} symbol Bitfinex instrument symbol based on official API docs.
 */
module.exports = function BitfinexOrderBook(symbol) {
  const orderBookOrders = {};
  orderBookOrders.asks = [];
  orderBookOrders.bids = [];
  let connectionCounter = 0;

  const config = {};
  config.request = {}
  config.request.event = 'subscribe'
  config.request.symbol = symbol;
  config.request.channel = 'book';
  config.request.prec = 'R0';
  config.request.len = '100';
  const bitfinexWs = BitfinexWs(config);

  const bitfinexOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    bitfinexWs: bitfinexWs,
    /**
     * Initialize order-book connection.
     */
    connect: function () {
      let connectingCounter = 0;
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.bitfinexWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`BitfinexOrderBook:${symbol} could not establish`
                + 'initial connection to WebSocket API.');
            }
            return;
          }
          clearInterval(interval);
          resolve();
        }, 500);
      });
    },

    /**
     * Terminate order-book connection.
     */
    disconnect: function () {
      this.status = 'disconnected';
      this.bitfinexWs.disconnect();
    },

    /**
     * Disconects websocket client and reconnects again.
     */
    reconnect: function () {
      this.disconnect();
      this.connect();
    },
    wss: orderBookWss,
  };

  /**
   * Function that executes when the bitfinexWs connection is open.
   */
  function onOpen() {
    console.log(`BitfinexOrderBook:${symbol} connection open.`);
    connectionCounter += 1;
  }

  /**
   * Function that executes when the bitfinexWs connection is close.
   */
  function onClose() {
    console.log(`BitfinexOrderBook:${symbol} connection close.`);
    bitfinexOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`BitfinexOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => {
      bitfinexOrderBook.disconnect();
      bitfinexOrderBook.connect();
    }, waitSeconds);
  }

  /**
   * Function that executes when the bitfinexWs connection send an error.
   */
  function onError(error) {
    console.log(`BitfinexOrderBook:${symbol} connection error.`);
    console.log(error);
    bitfinexOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`BitfinexOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }

  /**
   * Function that executes when the bitfinexWs connection receives a message.
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (bitfinexOrderBook.status !== 'connected') {
      if (Array.isArray(messageParsed)) {
        bitfinexOrderBook.status = 'connected';
        synchronizeOrderBook(messageParsed[1], bitfinexOrderBook, orderBookOrders);
      }
      return;
    }
    if (!Array.isArray(messageParsed[1])) { return };
    updateOrders(messageParsed[1], bitfinexOrderBook, orderBookOrders);
  }

  bitfinexWs.onOpen(onOpen);
  bitfinexWs.onClose(onClose);
  bitfinexWs.onError(onError);
  bitfinexWs.onMessage(onMessage);

  return bitfinexOrderBook;
};
