const BitstampWs = require('@gabrielgrijalva/crypto-exchanges').BitstampWs;
const round = require('../../utils/round');

/**
 * Function that takes order-book initial data and stores it on BitstampOrderBook object.
 * @param {Object} data Received order-book initial data from the WebSocket connection.
 * @param {Object} bitstampOrderBook BitstampOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(data, bitstampOrderBook) {
  bitstampOrderBook.asks.length = 0;
  bitstampOrderBook.bids.length = 0;
  data.asks = cleanSnapshotOrders(data.asks);
  data.bids = cleanSnapshotOrders(data.bids);
  data.asks.forEach(askUpdate => {
    const ask = {};
    ask.id = +askUpdate[0];
    ask.price = +askUpdate[0];
    ask.size = +askUpdate[1];
    bitstampOrderBook.asks.push(ask);
  });
  data.bids.forEach(bidUpdate => {
    const bid = {};
    bid.id = +bidUpdate[0];
    bid.price = +bidUpdate[0];
    bid.size = +bidUpdate[1];
    bitstampOrderBook.bids.push(bid);
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
      insertOrder = order;
    } else if (insertOrder[0] === order[0]) {
      insertOrder[1] = round.normal(insertOrder[1] + order[1], 8);
    } else {
      cleanedOrders.push(insertOrder);
      insertOrder = order;
    }
  }
  return cleanedOrders;
}
/**
 * Takes a given array of asks and updates internal asks.
 * @param {Array} currentAsks Asks to be updated.
 * @param {Array} currentAsksUpdates Asks with update information.
 */
function updateAsks(currentAsks, currentAsksUpdates) {
  const asks = currentAsks;
  const asksUpdates = currentAsksUpdates;
  asksUpdates.forEach((askUpdate) => {
    const index = asks.findIndex(ask => ask.price === +askUpdate[0]);
    if (index === -1 && +askUpdate[1] > 0) {
      const indexToInsert = asks.findIndex(ask => ask.price > +askUpdate[0]);
      const ask = {};
      ask.id = +askUpdate[0];
      ask.price = +askUpdate[0];
      ask.size = +askUpdate[1];
      asks.splice(indexToInsert !== -1 ? indexToInsert : asks.length, 0, ask);
    } else if (index !== -1 && +askUpdate[1] === 0) {
      asks.splice(index, 1);
    } else if (index !== -1 && +askUpdate[1] > 0) {
      asks[index].size = +askUpdate[1];
    }
  });
}
/**
 * Takes a given array of bids and updates internal bids.
 * @param {Array} currentBids Bids to be updated.
 * @param {Array} currentBidsUpdates Bids with update information.
 */
function updateBids(currentBids, currentBidsUpdates) {
  const bids = currentBids;
  const bidsUpdates = currentBidsUpdates;
  bidsUpdates.forEach((bidUpdate) => {
    const index = bids.findIndex(bid => bid.price === +bidUpdate[0]);
    if (index === -1 && +bidUpdate[1] > 0) {
      const indexToInsert = bids.findIndex(bid => bid.price < +bidUpdate[0]);
      const bid = {};
      bid.id = +bidUpdate[0];
      bid.price = +bidUpdate[0];
      bid.size = +bidUpdate[1];
      bids.splice(indexToInsert !== -1 ? indexToInsert : bids.length, 0, bid);
    } else if (index !== -1 && +bidUpdate[1] === 0) {
      bids.splice(index, 1);
    } else if (index !== -1 && +bidUpdate[1] > 0) {
      bids[index].size = +bidUpdate[1];
    }
  });
}


/**
 * Create Bitstamp instrument order-book interface.
 * @param {string} symbol Bitstamp instrument symbol based on official API docs.
 */
module.exports = function BitstampOrderBook(symbol) {
  const tradesBuffer = {};
  tradesBuffer.asks = [];
  tradesBuffer.bids = [];
  let connectionCounter = 0;
  let synchronizedTimestamp = 0;

  const config = {};
  config.request = {};
  config.request.event = 'bts:subscribe';
  const data = {};
  data.channel = `diff_order_book_${symbol}`;
  config.request.data = data;
  const bitstampWs = BitstampWs(config);

  const bitstampOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    bitstampWs: bitstampWs,
    /**
     * Initialize order-book connection.
     */
    connect: function () {
      let connectingCounter = 0;
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.bitstampWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`BitstampOrderBook:${symbol} could not establish`
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
      this.bitstampWs.disconnect();
    },

    /**
     * Disconects websocket client and reconnects again.
     */
    reconnect: function () {
      this.disconnect();
      this.connect();
    }
  };

  /**
   * Function that executes when the bitstampWs connection is open.
   */
  function onOpen() {
    console.log(`BitstampOrderBook:${symbol} connection open.`);
    connectionCounter += 1;
  }

  /**
   * Function that executes when the bitstampWs connection is close.
   */
  function onClose() {
    console.log(`BitstampOrderBook:${symbol} connection close.`);
    bitstampOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`BitstampOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => bitstampOrderBook.bitstampWs.connect(), waitSeconds);
  }

  /**
   * Function that executes when the bitstampWs connection send an error.
   */
  function onError(error) {
    console.log(`BitstampOrderBook:${symbol} connection error.`);
    console.log(error);
    bitstampOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`BitstampOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }

  /**
   * Function that executes when the bitstampWs connection receives a message.
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (bitstampOrderBook.status !== 'connected') {
      if (messageParsed.event === 'data' && messageParsed.channel
        === `diff_order_book_${symbol}`) {
        messageParsed.data.asks.forEach(ask => tradesBuffer.asks.push(ask));
        messageParsed.data.bids.forEach(bid => tradesBuffer.bids.push(bid));
      }
      if (messageParsed.event === 'bts:subscription_succeeded' && messageParsed
        .channel === `diff_order_book_${symbol}`) {
        const request = {};
        request.event = 'bts:subscribe';
        request.data = {};
        request.data.channel = `detail_order_book_${symbol}`;
        bitstampOrderBook.bitstampWs.send(JSON.stringify(request));
      }
      if (messageParsed.event === 'data' && messageParsed.channel
        === `detail_order_book_${symbol}`) {
        const request = {};
        request.event = 'bts:unsubscribe';
        request.data = {};
        request.data.channel = `detail_order_book_${symbol}`;
        bitstampOrderBook.bitstampWs.send(JSON.stringify(request));
        synchronizeOrderBook(messageParsed.data, bitstampOrderBook);
        synchronizedTimestamp = +messageParsed.data.microtimestamp;
      }
      if (messageParsed.event === 'bts:unsubscription_succeeded' && messageParsed
        .channel === `detail_order_book_${symbol}`) {
        tradesBuffer.asks = tradesBuffer.asks.filter(ask => +ask[3]
          > synchronizedTimestamp);
        tradesBuffer.bids = tradesBuffer.bids.filter(bid => +bid[3]
          > synchronizedTimestamp);
        updateAsks(bitstampOrderBook.asks, tradesBuffer.asks);
        updateBids(bitstampOrderBook.bids, tradesBuffer.bids);
        tradesBuffer.asks.length = 0;
        tradesBuffer.bids.length = 0;
        bitstampOrderBook.status = 'connected';
      }
    }
    if (messageParsed.event !== 'data' || messageParsed.channel
      !== `diff_order_book_${symbol}`) {
      return;
    }
    if (messageParsed.data.asks) {
      updateAsks(bitstampOrderBook.asks, messageParsed.data.asks);
    }
    if (messageParsed.data.bids) {
      updateBids(bitstampOrderBook.bids, messageParsed.data.bids);
    }
  }

  bitstampWs.onOpen(onOpen);
  bitstampWs.onClose(onClose);
  bitstampWs.onError(onError);
  bitstampWs.onMessage(onMessage);

  return bitstampOrderBook;
};
