const BinanceWs = require('@gabrielgrijalva/crypto-exchanges').BinanceCoinFuturesWs;
const BinanceRest = require('@gabrielgrijalva/crypto-exchanges').BinanceCoinFuturesRest;

/**
 * Function that takes order-book initial data and stores it on BinanceOrderBook object.
 * @param {Object} orderBookSnapshot Received order-book initial data from the WebSocket connection.
 * @param {Object} binanceOrderBook BinanceOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(orderBookSnapshot, binanceOrderBook) {
  const asks = binanceOrderBook.asks;
  const bids = binanceOrderBook.bids;
  const askUpdates = orderBookSnapshot.asks;
  const bidUpdates = orderBookSnapshot.bids;
  asks.length = 0;
  bids.length = 0;
  askUpdates.forEach(askUpdate => {
    const askOrder = {};
    askOrder.id = +askUpdate[0];
    askOrder.price = +askUpdate[0];
    askOrder.size = +askUpdate[1];
    asks.push(askOrder);
  });
  bidUpdates.forEach(bidUpdate => {
    const bidOrder = {};
    bidOrder.id = +bidUpdate[0];
    bidOrder.price = +bidUpdate[0];
    bidOrder.size = +bidUpdate[1];
    bids.push(bidOrder);
  });
}

/**
 * Function that takes order-book update data and updates BinanceOrderBook object.
 * @param {Object} side Order book side to be updated.
 * @param {Object} orders Current order book orders.
 * @param {Object} orderUpdates New order updates received.
 */
function updateOrderBook(side, orders, orderUpdates) {
  orderUpdates.forEach((orderUpdate) => {
    const orderIndex = orders.findIndex(order => order.price === +orderUpdate[0]);
    if (orderIndex === -1 && +orderUpdate[1]) {
      const order = {};
      order.id = +orderUpdate[0];
      order.price = +orderUpdate[0];
      order.size = +orderUpdate[1];
      const orderIndexInsert = side === 'asks' ?
        orders.findIndex(order => +orderUpdate[0] < order.price) :
        orders.findIndex(order => +orderUpdate[0] > order.price);
      orders.splice(orderIndexInsert !== -1 ? orderIndexInsert
        : orders.length, 0, order);
    }
    if (orderIndex !== -1 && +orderUpdate[1]) {
      const order = orders[orderIndex];
      order.size = +orderUpdate[1];
    }
    if (orderIndex !== -1 && !(+orderUpdate[1])) {
      orders.splice(orderIndex, 1);
    }
  });
}

/**
 * Create Binance instrument order-book interface.
 * @param {string} symbol Binance instrument symbol based on official API docs.
 *
 */
module.exports = function BinanceOrderBook(symbol) {
  let connectionCounter = 0;
  let orderBookSnapshot = null;
  let lastUpdateTimestamp = 0;
  let lastUpdateIntervalId = 0;
  let timeoutConnectionCounter = 0;
  let gettingOrderBookSnapshot = false;

  const config = {};
  config.stream = `${symbol.toLowerCase()}@depth`;
  const binanceWs = BinanceWs(config);
  const binanceRest = BinanceRest();

  const binanceOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    binanceWs: binanceWs,
    /**
     * Initialize order-book connection.
     */
    connect: function () {
      let connectingCounter = 0;
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.binanceWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`BinanceOrderBook:${symbol} could not establish`
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
      this.binanceWs.disconnect();
      clearInterval(lastUpdateIntervalId);
    },

    /**
     * Disconects websocket client and reconnects again.
     */
    reconnect: function () {
      this.disconnect();
      this.connect();
    }
  };

  async function getOrderBookSnapshot() {
    const params = {};
    params.symbol = symbol;
    gettingOrderBookSnapshot = true;
    orderBookSnapshot = await binanceRest.getDepth(params);
    gettingOrderBookSnapshot = false;
  }

  /**
   * Function that executes when the binanceWs connection is open.
   */
  function onOpen() {
    console.log(`BinanceOrderBook:${symbol} connection open.`);
    connectionCounter += 1;
    clearTimeout(timeoutConnectionCounter);
    timeoutConnectionCounter = setTimeout(() => timeoutConnectionCounter = 0,
      1200000);
    lastUpdateIntervalId = setInterval(() => {
      if (binanceOrderBook.status === 'connected') {
        if (Date.now() - lastUpdateTimestamp > 10000) {
          binanceOrderBook.disconnect();
          binanceOrderBook.connect();
        }
      }
    }, 5000);
  }

  /**
   * Function that executes when the binanceWs connection is close.
   */
  function onClose() {
    console.log(`BinanceOrderBook:${symbol} connection close.`);
    binanceOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`BinanceOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => binanceOrderBook.binanceWs.connect(), waitSeconds);
  }

  /**
   * Function that executes when the binanceWs connection send an error.
   */
  function onError(error) {
    console.log(`BinanceOrderBook:${symbol} connection error.`);
    console.log(error);
    binanceOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`BinanceOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }

  /**
   * Function that executes when the binanceWs connection receives a message.
   */
  async function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (binanceOrderBook.status !== 'connected') {
      if (!orderBookSnapshot && !gettingOrderBookSnapshot) {
        getOrderBookSnapshot()
      }
      if (orderBookSnapshot) {
        const lastUpdateIdPlus = orderBookSnapshot.lastUpdateId + 1;
        if (lastUpdateIdPlus < messageParsed.U) {
          orderBookSnapshot = null;
          gettingOrderBookSnapshot = false;
        }
        if (lastUpdateIdPlus >= messageParsed.U && lastUpdateIdPlus
          <= messageParsed.u) {
          synchronizeOrderBook(orderBookSnapshot, binanceOrderBook);
          orderBookSnapshot = null;
          gettingOrderBookSnapshot = false;
          binanceOrderBook.status = 'connected';
        }
      }
    }
    if (binanceOrderBook.status !== 'connected') { return };
    lastUpdateTimestamp = Date.now();
    if (messageParsed.a) {
      updateOrderBook('asks', binanceOrderBook.asks, messageParsed.a);
    }
    if (messageParsed.b) {
      updateOrderBook('bids', binanceOrderBook.bids, messageParsed.b);
    }
  }

  binanceWs.onOpen(onOpen);
  binanceWs.onClose(onClose);
  binanceWs.onError(onError);
  binanceWs.onMessage(onMessage);

  return binanceOrderBook;
};
