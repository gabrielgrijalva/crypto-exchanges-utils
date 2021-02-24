const CoinbaseWs = require('@gabrielgrijalva/crypto-exchanges').CoinbaseWs;
const orderBookWss = require('../../shared/order-book-wss');

/**
 * Function that takes order-book initial data and stores it on CoinbaseOrderBook object.
 *
 * @param {Object} data Received order-book initial data from the WebSocket connection.
 * @param {Object} coinbaseOrderBook CoinbaseOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(data, coinbaseOrderBook) {
  coinbaseOrderBook.asks.length = 0;
  coinbaseOrderBook.bids.length = 0;
  data.asks.forEach(askUpdate => {
    const ask = {};
    ask.id = +askUpdate[0];
    ask.price = +askUpdate[0];
    ask.size = +askUpdate[1];
    coinbaseOrderBook.asks.push(ask);
  });
  data.bids.forEach(bidUpdate => {
    const bid = {};
    bid.id = +bidUpdate[0];
    bid.price = +bidUpdate[0];
    bid.size = +bidUpdate[1];
    coinbaseOrderBook.bids.push(bid);
  });
}
/**
 * Takes a given array of asks and updates internal asks.
 * @param {Array} currentAsks Asks to be updated.
 * @param {Array} currentAsksUpdates Asks with update information.
 */
function updateOrders(updates, coinbaseOrderBook) {
  updates.forEach((update) => {
    const asks = coinbaseOrderBook.asks;
    const bids = coinbaseOrderBook.bids;
    if (update[0] === 'sell') {
      const askUpdate = update;
      const index = asks.findIndex(ask => ask.price === +askUpdate[1]);
      if (index === -1 && +askUpdate[2] > 0) {
        const indexToInsert = asks.findIndex(ask => ask.price > +askUpdate[1]);
        const ask = {};
        ask.id = +askUpdate[1];
        ask.price = +askUpdate[1];
        ask.size = +askUpdate[2];
        asks.splice(indexToInsert !== -1 ? indexToInsert : asks.length, 0, ask);
      } else if (index !== -1 && +askUpdate[2] === 0) {
        asks.splice(index, 1);
      } else if (index !== -1 && +askUpdate[2] > 0) {
        asks[index].size = +askUpdate[2];
      }
    }
    if (update[0] === 'buy') {
      const bidUpdate = update;
      const index = bids.findIndex(bid => bid.price === +bidUpdate[1]);
      if (index === -1 && +bidUpdate[2] > 0) {
        const indexToInsert = bids.findIndex(bid => bid.price < +bidUpdate[1]);
        const bid = {};
        bid.id = +bidUpdate[1];
        bid.price = +bidUpdate[1];
        bid.size = +bidUpdate[2];
        bids.splice(indexToInsert !== -1 ? indexToInsert : bids.length, 0, bid);
      } else if (index !== -1 && +bidUpdate[2] === 0) {
        bids.splice(index, 1);
      } else if (index !== -1 && +bidUpdate[2] > 0) {
        bids[index].size = +bidUpdate[2];
      }
    }
  });
}
/**
 * Create Coinbase instrument order-book interface.
 * @param {string} symbol Coinbase instrument symbol based on official API docs.
 */
module.exports = function CoinbaseOrderBook(symbol) {
  let connectionCounter = 0;

  const config = {};
  config.request = {};
  config.request.type = 'subscribe';
  const channel = {};
  channel.name = 'level2';
  channel.product_ids = [symbol];
  config.request.channels = [channel];
  const coinbaseWs = CoinbaseWs(config);

  const coinbaseOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    coinbaseWs: coinbaseWs,
    /**
     * Initialize order-book connection.
     */
    connect: function () {
      let connectingCounter = 0;
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.coinbaseWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`CoinbaseOrderBook:${symbol} could not establish`
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
      this.coinbaseWs.disconnect();
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
   * Function that executes when the coinbaseWs connection is open.
   */
  function onOpen() {
    console.log(`CoinbaseOrderBook:${symbol} connection open.`);
    connectionCounter += 1;
  }

  /**
   * Function that executes when the coinbaseWs connection is close.
   */
  function onClose() {
    console.log(`CoinbaseOrderBook:${symbol} connection close.`);
    coinbaseOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`CoinbaseOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => {
      coinbaseOrderBook.disconnect();
      coinbaseOrderBook.connect();
    }, waitSeconds);
  }

  /**
   * Function that executes when the coinbaseWs connection send an error.
   */
  function onError(error) {
    console.log(`CoinbaseOrderBook:${symbol} connection error.`);
    console.log(error);
    coinbaseOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`CoinbaseOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }

  /**
   * Function that executes when the coinbaseWs connection receives a message.
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (coinbaseOrderBook.status !== 'connected') {
      if (messageParsed.type === 'snapshot') {
        coinbaseOrderBook.status = 'connected';
        synchronizeOrderBook(messageParsed, coinbaseOrderBook);
      }
      return;
    }
    if (messageParsed.changes.length) {
      updateOrders(messageParsed.changes, coinbaseOrderBook);
    }
  }

  coinbaseWs.onOpen(onOpen);
  coinbaseWs.onClose(onClose);
  coinbaseWs.onError(onError);
  coinbaseWs.onMessage(onMessage);

  return coinbaseOrderBook;
};
