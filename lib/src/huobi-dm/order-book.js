const zlib = require('zlib');
const HuobiDMWs = require('@gabrielgrijalva/crypto-exchanges').HuobiDMWs;

/**
 * Function that takes order-book data and stores it on HuobiDMOrderBook object.
 *
 * @param {Object} tick Received order-book data from the WebSocket connection.
 * @param {Object} huobiDMOrderBook huobiDMOrderBook interface object on which data will be stored.
 */
function synchronizeOrderBook(tick, huobiDMOrderBook) {
  huobiDMOrderBook.asks = tick.asks.map(ask => {
    return {
      id: +ask[0],
      price: +ask[0],
      size: +ask[1],
    }
  });

  huobiDMOrderBook.bids = tick.bids.map(bid => {
    return {
      id: +bid[0],
      price: +bid[0],
      size: +bid[1],
    }
  });
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
    }
  }

  const huobiDMWs = HuobiDMWs(config);

  const huobiDMOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    huobiDMWs: huobiDMWs,

    /**
     * Initialize order-book connection.
     *
     */
    connect: function () {
      return new Promise(resolve => {
        this.status = 'connecting';

        this.huobiDMWs.connect();

        const interval = setInterval(() => {
          connectingCounter++;

          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`HuobiDMOrderBook:${symbol} could not establish initial connection to WebSocket API.`);
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

      this.huobiDMWs.disconnect();
    }
  }

  /**
   * Function that executes when the huobiDMWd connection is open.
   *
   */
  function onOpen() {
    console.log(`HuobiDMOrderBook:${symbol} connection open.`);

    connectionCounter++;
  }

  /**
   * Function that executes when the huobiDMWd connection is close.
   *
   */
  function onClose() {
    console.log(`HuobiDMOrderBook:${symbol} connection close.`);

    huobiDMOrderBook.status = 'disconnected';

    const waitSeconds = Math.pow(2, connectionCounter);

    if (waitSeconds > 1024) {
      throw new Error(`HuobiDMOrderBook:${symbol} could not reconnect after several tries.`);
    }

    setTimeout(() => huobiDMOrderBook.huobiDMWs.connect(), waitSeconds);
  }

  /**
   * Function that executes when the huobiDMWs connection send an error.
   *
   */
  function onError(error) {
    const errorParsed = JSON.parse(zlib.unzipSync(error).toString());

    console.log(`HuobiDMOrderBook:${symbol} connection error.`);

    console.log(errorParsed);

    huobiDMOrderBook.status = 'disconnected';

    throw new Error(`HuobiDMOrderBook:${symbol} could not handle error thrown by websocket connection.`);
  }

  /**
   * Function that executes when the huobiDMWs connection receives a message.
   *
   */
  function onMessage(message) {
    const messageParsed = JSON.parse(zlib.unzipSync(message).toString());

    if (messageParsed.op === 'error') {
      console.log(`HuobiDMOrderBook:${symbol} received error over 'message' event.`);

      console.log(messageParsed);

      return;
    }

    if (messageParsed.ch !== config.subscriptionRequest.sub) {
      return;
    }

    huobiDMOrderBook.status = 'connected';

    synchronizeOrderBook(messageParsed.tick, huobiDMOrderBook);
  }

  huobiDMWs.onOpen(onOpen);
  huobiDMWs.onClose(onClose);
  huobiDMWs.onError(onError);
  huobiDMWs.onMessage(onMessage);

  return huobiDMOrderBook;
}
