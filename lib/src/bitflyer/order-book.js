const BitflyerWs = require(
  '@gabrielgrijalva/crypto-exchanges',
).BitflyerWs;

/**
 * Takes a given array of asks and updates internal asks.
 *
 * @param {Array} currentAsks Asks to be updated.
 * @param {Array} currentAsksUpdates Asks with update information.
 */
function updateAsks(currentAsks, currentAsksUpdates) {
  const asks = currentAsks;
  const asksUpdates = currentAsksUpdates;

  asksUpdates.forEach((askUpdate) => {
    const index = asks.findIndex(ask => ask.price === askUpdate.price);

    if (index === -1 && askUpdate.size > 0) {
      const indexToInsert = asks.findIndex(ask => ask.price
        > askUpdate.price);

      asks.splice(indexToInsert !== -1 ? indexToInsert : asks.length, 0, {
        id: askUpdate.price,
        price: askUpdate.price,
        size: askUpdate.size,
      });
    } else if (index !== -1 && askUpdate.size === 0) {
      asks.splice(index, 1);
    } else if (index !== -1 && askUpdate.size > 0) {
      asks[index].size = askUpdate.size;
    }
  });
}

/**
 * Takes a given array of bids and updates internal bids.
 *
 * @param {Array} currentBids Bids to be updated.
 * @param {Array} currentBidsUpdates Bids with update information.
 */
function updateBids(currentBids, currentBidsUpdates) {
  const bids = currentBids;
  const bidsUpdates = currentBidsUpdates;

  bidsUpdates.forEach((bidUpdate) => {
    const index = bids.findIndex(bid => bid.price === bidUpdate.price);

    if (index === -1 && bidUpdate.size > 0) {
      const indexToInsert = bids.findIndex(bid => bid.price
        < bidUpdate.price);

      bids.splice(indexToInsert !== -1 ? indexToInsert : bids.length, 0, {
        id: bidUpdate.price,
        price: bidUpdate.price,
        size: bidUpdate.size,
      });
    } else if (index !== -1 && bidUpdate.size === 0) {
      bids.splice(index, 1);
    } else if (index !== -1 && bidUpdate.size > 0) {
      bids[index].size = bidUpdate.size;
    }
  });
}

/**
 * Updates order book with update information.
 *
 * @param {Array} currentAsks Asks to be updated.
 * @param {Array} currentBids Bids to be updated.
 * @param {Object} currentUpdates Updates information to be updated in order book.
 */
function updateOrderBook(currentAsks, currentBids, currentUpdates) {
  const asks = currentAsks;
  const bids = currentBids;
  const updates = currentUpdates;

  updates.asks.forEach(updateAsk => asks.push({
    id: updateAsk.price,
    price: updateAsk.price,
    size: updateAsk.size,
  }));

  updates.bids.forEach(updateBid => bids.push({
    id: updateBid.price,
    price: updateBid.price,
    size: updateBid.size,
  }));
}

/**
 * Create Bitflyer instrument order-book interface.
 *
 * @param {string} symbol Bitflyer instrument symbol based on official API docs.
 *
 */
module.exports = function BitflyerOrderBook(symbol) {
  let intervalIdUpdates = 0;
  let intervalIdSnapshots = 0;
  let connectionCounter = 0;
  let connectingCounter = 0;
  let lastUpdateTimestampUpdates = 0;
  let lastUpdateTimestampSnapshots = 0;

  const channelUpdates = `lightning_board_${symbol}`;
  const channelSnapshots = `lightning_board_snapshot_${symbol}`;

  const bitflyerWsUpdates = BitflyerWs({ channelName: channelUpdates });
  const bitflyerWsSnapshots = BitflyerWs({ channelName: channelSnapshots });

  const bitflyerOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    bitflyerWsUpdates: bitflyerWsUpdates,
    bitflyerWsSnapshots: bitflyerWsSnapshots,

    /**
     * Initialize order-book connection.
     *
     */
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';

        this.bitflyerWsUpdates.connect();
        this.bitflyerWsSnapshots.connect();

        const interval = setInterval(() => {
          connectingCounter += 1;

          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`BitflyerOrderBook:${symbol} could not establish `
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
      if (this.bitflyerWsUpdates.ws) {
        clearInterval(intervalIdUpdates);
        this.bitflyerWsUpdates.disconnect();
      }
      if (this.bitflyerWsSnapshots.ws) {
        clearInterval(intervalIdSnapshots);
        this.bitflyerWsSnapshots.disconnect();
      }
    },
  };

  /**
   * Function that executes when the bitflyerWs connection is open.
   *
   */
  function onOpen(channel) {
    return function onOpenFunction() {
      const interval = setInterval(() => {
        if (bitflyerOrderBook.status === 'connected') {
          if (channel === 'Updates' && (Date.now() - lastUpdateTimestampUpdates) > 0) {
            bitflyerOrderBook.disconnect();
            bitflyerOrderBook.connect();
          }
          if (channel === 'Snapshots' && (Date.now() - lastUpdateTimestampSnapshots) > 0) {
            bitflyerOrderBook.disconnect();
            bitflyerOrderBook.connect();
          }
        }
      }, 5000);
      channel === 'Updates' ? intervalIdUpdates = interval : intervalIdSnapshots
        = interval;
      connectionCounter += 1;
    };
  }

  /**
   * Function that executes when the bitflyerWs connection is close.
   *
   */
  function onClose(channel) {
    return function onCloseFunction() {
      console.log(`BitflyerOrderBook${channel}:${symbol} connection close.`);

      bitflyerOrderBook.status = 'disconnected';

      const waitSeconds = 2 ** connectionCounter;

      if (waitSeconds >= 1024) {
        throw new Error(`BitflyerOrderBook${channel}:${symbol} could not `
          + 'reconnect after several tries.');
      }

      const bitflyerWebSocket = channel === 'Updates'
        ? bitflyerOrderBook.bitflyerWsUpdates
        : bitflyerOrderBook.bitflyerWsSnapshots;

      bitflyerWebSocket.disconnect();

      setTimeout(() => bitflyerWebSocket.connect(), waitSeconds * 1000);
    };
  }

  /**
   * Function that executes when the bitflyerWs connection sends an error.
   *
   */
  function onError(channel) {
    return function onErrorFunction(error) {
      console.log(`BitflyerOrderBook${channel}:${symbol} connection error.`);

      console.log(error);

      bitflyerOrderBook.status = 'disconnected';

      throw new Error(`BitflyerOrderBook${channel}:${symbol} could not `
        + 'handle error thrown by websocket connection.');
    };
  }

  /**
   * Function that executes when the bitflyerWsUpdates connection receives a message.
   *
   */
  function onMessageUpdates(message) {
    if (bitflyerOrderBook.status !== 'connected') {
      return;
    }
    lastUpdateTimestampUpdates = Date.now();
    updateAsks(bitflyerOrderBook.asks, message.asks);
    updateBids(bitflyerOrderBook.bids, message.bids);
  }

  /**
   * Function that executes when the bitflyerWsSnapshots connection receives a message.
   *
   */
  function onMessageSnapshots(message) {
    lastUpdateTimestampSnapshots = Date.now();
    bitflyerOrderBook.status = 'connected';
    bitflyerOrderBook.asks.length = 0;
    bitflyerOrderBook.bids.length = 0;
    updateOrderBook(bitflyerOrderBook.asks, bitflyerOrderBook.bids, message);
  }

  bitflyerWsUpdates.onOpen(onOpen('Updates'));
  bitflyerWsUpdates.onClose(onClose('Updates'));
  bitflyerWsUpdates.onError(onError('Updates'));
  bitflyerWsUpdates.onMessage(onMessageUpdates);

  bitflyerWsSnapshots.onOpen(onOpen('Snapshots'));
  bitflyerWsSnapshots.onClose(onClose('Snapshots'));
  bitflyerWsSnapshots.onError(onError('Snapshots'));
  bitflyerWsSnapshots.onMessage(onMessageSnapshots);

  return bitflyerOrderBook;
};
