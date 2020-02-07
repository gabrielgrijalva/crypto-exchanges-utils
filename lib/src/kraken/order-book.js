const KrakenWs = require('@gabrielgrijalva/crypto-exchanges').KrakenWs;

/**
 * Function that takes order-book initial data and stores it on KrakenOrderBook object.
 * @param {Object} data Received order-book initial data from the WebSocket connection.
 * @param {Object} krakenOrderBook KrakenOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(data, krakenOrderBook) {
  krakenOrderBook.asks.length = 0;
  krakenOrderBook.bids.length = 0;
  data.as.forEach(askUpdate => {
    const ask = {};
    ask.id = +askUpdate[0];
    ask.price = +askUpdate[0];
    ask.size = +askUpdate[1];
    krakenOrderBook.asks.push(ask);
  });
  data.bs.forEach(bidUpdate => {
    const bid = {};
    bid.id = +bidUpdate[0];
    bid.price = +bidUpdate[0];
    bid.size = +bidUpdate[1];
    krakenOrderBook.bids.push(bid);
  });
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
 * Create Kraken instrument order-book interface.
 * @param {string} symbol Kraken instrument symbol based on official API docs.
 */
module.exports = function KrakenOrderBook(symbol) {
  let connectionCounter = 0;
  let connectingCounter = 0;

  const config = {};
  config.request = {};
  config.request.event = 'subscribe';
  config.request.pair = [symbol];
  const subscription = {};
  subscription.name = 'book';
  subscription.depth = 1000;
  config.request.subscription = subscription;
  const krakenWs = KrakenWs(config);

  const krakenOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    krakenWs: krakenWs,
    /**
     * Initialize order-book connection.
     */
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

    /**
     * Terminate order-book connection.
     */
    disconnect: function () {
      this.status = 'disconnected';
      this.krakenWs.disconnect();
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
   * Function that executes when the krakenWs connection is open.
   */
  function onOpen() {
    console.log(`KrakenOrderBook:${symbol} connection open.`);
    connectionCounter += 1;
  }

  /**
   * Function that executes when the krakenWs connection is close.
   */
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

  /**
   * Function that executes when the krakenWs connection send an error.
   */
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

  /**
   * Function that executes when the krakenWs connection receives a message.
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (!Array.isArray(messageParsed)) {
      return;
    }
    if (krakenOrderBook.status !== 'connected') {
      if (messageParsed[1].as && messageParsed[1].bs) {
        krakenOrderBook.status = 'connected';
        synchronizeOrderBook(messageParsed[1], krakenOrderBook);
      }
      return;
    }
    if (messageParsed[1].a) {
      updateAsks(krakenOrderBook.asks, messageParsed[1].a);
    }
    if (messageParsed[2].a) {
      updateAsks(krakenOrderBook.asks, messageParsed[2].a);
    }
    if (messageParsed[1].b) {
      updateBids(krakenOrderBook.bids, messageParsed[1].b);
    }
    if (messageParsed[2].b) {
      updateBids(krakenOrderBook.bids, messageParsed[2].b);
    }
  }

  krakenWs.onOpen(onOpen);
  krakenWs.onClose(onClose);
  krakenWs.onError(onError);
  krakenWs.onMessage(onMessage);

  return krakenOrderBook;
};
