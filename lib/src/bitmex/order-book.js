const BitmexWs = require('@gabrielgrijalva/crypto-exchanges').BitmexWs;

/**
 * Function that takes order-book initial data and stores it on BitmexOrderBook object.
 *
 * @param {Object} data Received order-book initial data from the WebSocket connection.
 * @param {Object} bitmexOrderBook BitmexOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(data, bitmexOrderBook) {
  bitmexOrderBook.asks.length = 0;
  bitmexOrderBook.bids.length = 0;

  data.forEach(element => {
    if (element.side === 'Sell') {
      bitmexOrderBook.asks.unshift({
        id: +element.id,
        price: +element.price,
        size: +element.size,
      });
    }

    if (element.side === 'Buy') {
      bitmexOrderBook.bids.push({
        id: +element.id,
        price: +element.price,
        size: +element.size,
      });
    }
  });
}

/**
 * Function that takes order-book update data and updates BitmexOrderBook object.
 *
 * @param {Object} data Received order-book update data from the WebSocket connection.
 * @param {Object} bitmexOrderBook BitmexOrderBook interface object on which data will be stored.
 */
function updateOrderBook(data, bitmexOrderBook) {
  data.forEach(element => {
    if (element.side === 'Sell') {
      bitmexOrderBook.asks.find(ask => ask.id === +element.id).size = +element.size;
    }

    if (element.side === 'Buy') {
      bitmexOrderBook.bids.find(bid => bid.id === +element.id).size = +element.size;
    }
  });
}

/**
 * Function that takes order-book insert data and inserts to BitmexOrderBook object.
 *
 * @param {Object} data Received order-book insert data from the WebSocket connection.
 * @param {Object} bitmexOrderBook BitmexOrderBook interface object on which data will be stored.
 */
function insertOrderBook(data, bitmexOrderBook) {
  data.forEach(element => {
    if (element.side === 'Sell') {
      const index = bitmexOrderBook.asks.findIndex(ask => ask.price > +element.price);

      bitmexOrderBook.asks.splice(index !== -1 ? index : bitmexOrderBook.asks.length, 0, {
        id: +element.id,
        price: +element.price,
        size: +element.size,
      });
    }

    if (element.side === 'Buy') {
      const index = bitmexOrderBook.bids.findIndex(bid => bid.price < +element.price);

      bitmexOrderBook.bids.splice(index !== -1 ? index : bitmexOrderBook.bids.length, 0, {
        id: +element.id,
        price: +element.price,
        size: +element.size,
      });
    }
  });
}

/**
 * Function that takes order-book delete data and deletes from BitmexOrderBook object.
 *
 * @param {Object} data Received order-book delete data from the WebSocket connection.
 * @param {Object} bitmexOrderBook BitmexOrderBook interface object on which data will be stored.
 */
function deleteOrderBook(data, bitmexOrderBook) {
  data.forEach(element => {
    if (element.side === 'Sell') {
      const index = bitmexOrderBook.asks.findIndex(ask => ask.id === +element.id);

      bitmexOrderBook.asks.splice(index, index !== -1 ? 1 : 0);
    }

    if (element.side === 'Buy') {
      const index = bitmexOrderBook.bids.findIndex(bid => bid.id === +element.id);

      bitmexOrderBook.bids.splice(index, index !== -1 ? 1 : 0);
    }
  });
}

/**
 * Create Bitmex instrument order-book interface.
 *
 * @param {string} symbol Bitmex instrument symbol based on official API docs.
 * 
 */
module.exports = function BitmexOrderBook(symbol) {
  let connectionCounter = 0;
  let connectingCounter = 0;

  const topic = `orderBookL2:${symbol}`;
  const bitmexWs = BitmexWs({ topic: topic });

  const bitmexOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    bitmexWs: bitmexWs,

    /**
     * Initialize order-book connection.
     *
     */
    connect: function () {
      return new Promise(resolve => {
        this.status = 'connecting';

        this.bitmexWs.connect();

        const interval = setInterval(() => {
          connectingCounter++;

          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`BitmexOrderBook:${symbol} could not establish initial connection to WebSocket API.`);
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
     *
     */
    disconnect: function () {
      this.asks.length = 0;
      this.bids.length = 0;
      this.status = 'disconnected';

      this.bitmexWs.disconnect();
    }
  }

  /**
   * Function that executes when the bitmexWs connection is open.
   *
   */
  function onOpen() {
    console.log(`BitmexOrderBook:${symbol} connection open.`);

    connectionCounter++;
  }

  /**
   * Function that executes when the bitmexWs connection is close.
   *
   */
  function onClose() {
    console.log(`BitmexOrderBook:${symbol} connection close.`);

    bitmexOrderBook.status = 'disconnected';

    const waitSeconds = Math.pow(2, connectionCounter);

    if (waitSeconds > 1024) {
      throw new Error(`BitmexOrderBook:${symbol} could not reconnect after several tries.`);
    }

    setTimeout(() => bitmexOrderBook.bitmexWs.connect(), waitSeconds)
  }

  /**
   * Function that executes when the bitmexWs connection send an error.
   *
   */
  function onError(error) {
    console.log(`BitmexOrderBook:${symbol} connection error.`);

    console.log(error);

    bitmexOrderBook.status = 'disconnected';

    if (err.message === 'Unexpected server response: 503' || err.message === 'Unexpected server response: 504') {
      return;
    }

    throw new Error(`BitmexOrderBook:${symbol} could not handle error thrown by websocket connection.`);
  }

  /**
   * Function that executes when the bitmexWs connection receives a message.
   *
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(message);

    if (bitmexOrderBook.status !== 'connected') {
      if (messageParsed.action === 'partial') {
        bitmexOrderBook.status = 'connected';

        synchronizeOrderBook(messageParsed.data, bitmexOrderBook);
      }

      return;
    }

    if (messageParsed.action === 'update') {
      updateOrderBook(messageParsed.data, bitmexOrderBook);
    }

    if (messageParsed.action === 'insert') {
      insertOrderBook(messageParsed.data, bitmexOrderBook);
    }

    if (messageParsed.action === 'delete') {
      deleteOrderBook(messageParsed.data, bitmexOrderBook);
    }
  }

  bitmexWs.onOpen(onOpen);
  bitmexWs.onClose(onClose);
  bitmexWs.onError(onError);
  bitmexWs.onMessage(onMessage);

  return bitmexOrderBook;
}

