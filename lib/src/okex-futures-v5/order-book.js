const moment = require('moment');
const OkexWs = require('@gabrielgrijalva/crypto-exchanges').OkexFuturesV5Ws;
const orderBookWss = require('../../shared/order-book-wss');

/**
 * Function that takes order-book data and stores it on OkexOrderBook object.
 *
 * @param {Object} data Received order-book data from the WebSocket connection.
 * @param {Object} okexOrderBook okexOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(data, okexOrderBook) {
  const orderBook = okexOrderBook;

  orderBook.asks = data.asks.map(ask => ({
    id: +ask[0],
    price: +ask[0],
    size: +ask[1],
  }));

  orderBook.bids = data.bids.map(bid => ({
    id: +bid[0],
    price: +bid[0],
    size: +bid[1],
  }));
}

/**
 * Updates asks with passed updates.
 * 
 * @param {Array} updates Updates to be implemented.
 * @param {Array} orders Orders to be updated.
 */
function updateAsks(updates, orders) {
  updates.forEach(update => {
    const orderIndex = orders.findIndex(order => order.id === +update[0]);

    if (orderIndex === -1) {
      if (+update[1]) {
        const insertIndex = orders.findIndex(order => +update[0] < order.price);

        const newOrder = {
          id: +update[0],
          price: +update[0],
          size: +update[1],
        };

        if (insertIndex === -1) {
          orders.push(newOrder);
        } else {
          orders.splice(insertIndex, 0, newOrder);
        }
      }
    } else {
      if (+update[1]) {
        const orderToUpdate = orders[orderIndex];

        orderToUpdate.size = +update[1];
      } else {
        orders.splice(orderIndex, 1);
      }
    }
  });
}

/**
 * Updates bids with passed updates.
 * 
 * @param {Array} updates Updates to be implemented.
 * @param {Array} orders Orders to be updated.
 */
function updateBids(updates, orders) {
  updates.forEach(update => {
    const orderIndex = orders.findIndex(order => order.id === +update[0]);

    if (orderIndex === -1) {
      if (+update[1]) {
        const insertIndex = orders.findIndex(order => +update[0] > order.price);

        const newOrder = {
          id: +update[0],
          price: +update[0],
          size: +update[1],
        };

        if (insertIndex === -1) {
          orders.push(newOrder);
        } else {
          orders.splice(insertIndex, 0, newOrder);
        }
      }
    } else {
      if (+update[1]) {
        const orderToUpdate = orders[orderIndex];

        orderToUpdate.size = +update[1];
      } else {
        orders.splice(orderIndex, 1);
      }
    }
  });
}

/**
 * Create Okex instrument order-book interface.
 *
 * @param {string} symbol Okex instrument symbol based on official API docs.
 *
 */
module.exports = function OkexOrderBook(type, symbol) {
  let connectionCounter = 0;
  let connectingCounter = 0;

  const apiKey = process.env.OKEX_API_KEY;
  const apiSecret = process.env.OKEX_API_SECRET;
  const apiPassphrase = process.env.OKEX_API_PASSPHRASE;

  const config = {
    symbol: symbol,
    apiKey: apiKey,
    apiSecret: apiSecret,
    apiPassphrase: apiPassphrase,
    channelType: 'public',
    channelName: `books-l2-tbt`,
  };

  const okexWs = OkexWs(config);

  const okexOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    okexWs: okexWs,

    /**
     * Initialize order-book connection.
     *
     */
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';

        this.okexWs.connect();

        const interval = setInterval(() => {
          connectingCounter += 1;

          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`OkexOrderBook:${symbol} could not establish`
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
     *
     */
    disconnect: function () {
      this.status = 'disconnected';

      this.okexWs.disconnect();
    },
    wss: orderBookWss,
  };

  /**
   * Function that executes when the okexWs connection is open.
   *
   */
  function onOpen() {
    console.log(`OkexOrderBook:${symbol} connection open: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);

    connectionCounter += 1;
  }

  /**
   * Function that executes when the okexWs connection is close.
   *
   */
  function onClose() {
    console.log(`OkexOrderBook:${symbol} connection close: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);
    okexOrderBook.asks.length = 0;
    okexOrderBook.bids.length = 0;
    if (okexOrderBook.status !== 'disconnected') {
      okexOrderBook.status = 'disconnected';

      const waitSeconds = 2 ** connectionCounter;

      if (waitSeconds > 1024) {
        throw new Error(`OkexOrderBook:${symbol} could not`
          + 'reconnect after several tries.');
      }

      setTimeout(() => {
        okexOrderBook.disconnect();
        okexOrderBook.connect();
      }, waitSeconds);
    }
  }

  /**
   * Function that executes when the okexWs connection send an error.
   *
   */
  function onError(error) {
    console.log(`OkexOrderBook:${symbol} connection error: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);

    console.log(error);

    okexOrderBook.status = 'disconnected';

    throw new Error(`OkexOrderBook:${symbol} could not handle`
      + 'error thrown by websocket connection.');
  }

  /**
   * Function that executes when the okexWs connection receives a message.
   *
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(message.toString());

    if (messageParsed.event === 'error') {
      console.log(`OkexOrderBook:${symbol} received`
        + 'error over \'message\' event.');

      console.log(messageParsed);

      return;
    }

    if (messageParsed.arg.channel === 'books-l2-tbt' && messageParsed.action === 'snapshot') {
      okexOrderBook.status = 'connected';

      synchronizeOrderBook(messageParsed.data[0], okexOrderBook);
    }

    if (messageParsed.arg.channel === 'books-l2-tbt' && messageParsed.action === 'update') {
      const data = messageParsed.data[0];

      updateAsks(data.asks, okexOrderBook.asks);

      updateBids(data.bids, okexOrderBook.bids);
    }
  }

  okexWs.onOpen(onOpen);
  okexWs.onClose(onClose);
  okexWs.onError(onError);
  okexWs.onMessage(onMessage);

  return okexOrderBook;
}