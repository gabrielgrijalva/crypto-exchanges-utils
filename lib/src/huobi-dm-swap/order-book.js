const zlib = require('zlib');
const HuobiDMSwapWs = require('@gabrielgrijalva/crypto-exchanges').HuobiDMSwapWs;
const orderBookWss = require('../../shared/order-book-wss');

/**
 * Function that takes order-book data and stores it on HuobiDMOrderBook object.
 *
 * @param {Object} tick Received order-book data from the WebSocket connection.
 * @param {Object} huobiDMOrderBook huobiDMOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(tick, huobiDMOrderBook) {
  const orderBook = huobiDMOrderBook;

  orderBook.asks = tick.asks.map(ask => ({
    id: +ask[0],
    price: +ask[0],
    size: +ask[1],
  }));

  orderBook.bids = tick.bids.map(bid => ({
    id: +bid[0],
    price: +bid[0],
    size: +bid[1],
  }));
}

/**
 * Create Huobi DM instrument order-book interface.
 *
 * @param {string} symbol Huobi DM instrument symbol based on official API docs.
 *
 */
module.exports = function HuobiDMOrderBook(symbol) {
  let connectionCounter = 0;
  let connectingCounter = 0;

  const config = {
    subscriptionType: 'public',
    subscriptionRequest: {
      id: 'id',
      sub: `market.${symbol}.depth.step0`,
    },
  };

  const huobiDMWs = HuobiDMSwapWs(config);

  const huobiDMOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    intervalId: 0,
    lastUpdateTimestamp: 0,
    huobiDMWs: huobiDMWs,

    /**
     * Initialize order-book connection.
     *
     */
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';

        this.huobiDMWs.connect();

        const interval = setInterval(() => {
          connectingCounter += 1;

          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`HuobiDMOrderBook:${symbol} could not establish`
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
      clearInterval(this.intervalId);
      this.status = 'disconnected';
      this.lastUpdateTimestamp = 0;
      this.huobiDMWs.disconnect();
    },
    wss: orderBookWss,
  };

  /**
   * Function that executes when the huobiDMWd connection is open.
   *
   */
  function onOpen() {
    console.log(`HuobiDMOrderBook:${symbol} connection open.`);
    huobiDMOrderBook.intervalId = setInterval(() => {
      if (huobiDMOrderBook.status === 'connected') {
        const currentTimestamp = Date.now();
        const lastUpdateTimestamp = huobiDMOrderBook.lastUpdateTimestamp;
        if ((currentTimestamp - lastUpdateTimestamp) > 60000) {
          huobiDMOrderBook.disconnect();
          huobiDMOrderBook.connect();
        }
      }
    }, 5000);
    connectionCounter += 1;
  }

  /**
   * Function that executes when the huobiDMWd connection is close.
   *
   */
  function onClose() {
    console.log(`HuobiDMOrderBook:${symbol} connection close.`);

    huobiDMOrderBook.status = 'disconnected';

    const waitSeconds = 2 ** connectionCounter;

    if (waitSeconds >= 1024) {
      throw new Error(`HuobiDMOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }

    setTimeout(() => huobiDMOrderBook.huobiDMWs.connect(), waitSeconds);
  }

  /**
   * Function that executes when the huobiDMWs connection send an error.
   *
   */
  function onError(error) {
    console.log(`HuobiDMOrderBook:${symbol} connection error.`);

    console.log(error);

    huobiDMOrderBook.status = 'disconnected';

    throw new Error(`HuobiDMOrderBook:${symbol} could not handle`
      + 'error thrown by websocket connection.');
  }

  /**
   * Function that executes when the huobiDMWs connection receives a message.
   *
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(zlib.unzipSync(message).toString());

    if (messageParsed.op === 'error') {
      console.log(`HuobiDMOrderBook:${symbol} received`
        + 'error over \'message\' event.');

      console.log(messageParsed);

      return;
    }

    if (messageParsed.ch !== config.subscriptionRequest.sub) {
      return;
    }

    huobiDMOrderBook.status = 'connected';

    huobiDMOrderBook.lastUpdateTimestamp = Date.now();

    synchronizeOrderBook(messageParsed.tick, huobiDMOrderBook);
  }

  huobiDMWs.onOpen(onOpen);
  huobiDMWs.onClose(onClose);
  huobiDMWs.onError(onError);
  huobiDMWs.onMessage(onMessage);

  return huobiDMOrderBook;
};
