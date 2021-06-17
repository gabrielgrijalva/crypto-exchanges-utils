const DeribitWs = require('@gabrielgrijalva/crypto-exchanges').DeribitWs;
const orderBookWss = require('../../shared/order-book-wss');

function snapshotOrderBook(data, orderBook) {
  orderBook.asks.length = 0;
  orderBook.bids.length = 0;
  ['asks', 'bids'].forEach(t => {
    data[t].forEach(v => {
      const newOrder = {};
      newOrder.id = +v[1];
      newOrder.size = +v[2];
      newOrder.price = +v[1];
      orderBook[t].push(newOrder);
    });
  });
};
function getFindIndexFunc(side, type) {
  if (type === 'new') {
    if (side === 'asks') {
      return (orderPrice) => (v) => orderPrice < v.price;
    }
    if (side === 'bids') {
      return (orderPrice) => (v) => orderPrice > v.price;
    }
  }
  if (type === 'change' || type === 'delete') {
    return (orderPrice) => (v) => orderPrice === v.price;
  }
};
function getExecuteActionFunc(type) {
  if (type === 'new') {
    return (index, newOrder, obOrders) => {
      index === -1 ? obOrders.push(newOrder) : obOrders.splice(index, 0, newOrder);
    };
  }
  if (type === 'change') {
    return (index, newOrder, obOrders) => {
      obOrders[index].size = newOrder.size;
    };
  }
  if (type === 'delete') {
    return (index, newOrder, obOrders) => {
      obOrders.splice(index, 1);
    };
  }
};
function getActionTypeFunc(side, type, obOrders) {
  const findIndexFunc = getFindIndexFunc(side, type);
  const executeActionFunc = getExecuteActionFunc(type);
  return function actionTypeFun(newData) {
    const newOrder = {};
    newOrder.id = +newData[1];
    newOrder.size = +newData[2];
    newOrder.price = +newData[1];
    const index = obOrders.findIndex(findIndexFunc(newOrder.price));
    executeActionFunc(index, newOrder, obOrders);
  }
};
function updateOrderBook(data, orderBook) {
  ['asks', 'bids'].forEach(s => {
    const obOrders = orderBook[s];
    const newOrders = data[s];
    const actionTypeNew = getActionTypeFunc(s, 'new', obOrders);
    const actionTypeChange = getActionTypeFunc(s, 'change', obOrders);
    const actionTypeDelete = getActionTypeFunc(s, 'delete', obOrders);
    newOrders.forEach(v => {
      if (v[0] === 'new') { actionTypeNew(v) };
      if (v[0] === 'change') { actionTypeChange(v) };
      if (v[0] === 'delete') { actionTypeDelete(v) };
    });
  });
};
module.exports = function DeribitOrderBook(symbol) {
  let prevChangeId = 0;
  let connectionCounter = 0;
  let connectingCounter = 0;
  let lastUpdateTimestamp = 0;
  const config = {};
  config.subsParams = {
    id: '1',
    method: 'public/subscribe',
    jsonrpc: '2.0',
    params: {
      channels: [`book.${symbol}.100ms`],
    },
  };
  const deribitWs = DeribitWs(config);
  const deribitOrderBook = {
    asks: [],
    bids: [],
    status: 'disconnected',
    deribitWs: deribitWs,
    connect: function () {
      return new Promise((resolve) => {
        this.status = 'connecting';
        this.deribitWs.connect();
        const interval = setInterval(() => {
          connectingCounter += 1;
          if (this.status !== 'connected') {
            if (connectingCounter > 60) {
              throw new Error(`DeribitOrderBook:${symbol} could not establish`
                + 'initial connection to WebSocket API.');
            }
            return;
          }
          clearInterval(interval);
          resolve();
        }, 500);
      });
    },
    disconnect: function () {
      prevChangeId = 0;
      this.status = 'disconnected';
      this.deribitWs.disconnect();
    },
    reconnect: function () {
      this.disconnect();
      this.connect();
    },
    wss: orderBookWss,
  };
  function onOpen() {
    connectionCounter += 1;
    console.log(`DeribitOrderBook:${symbol} connection open.`);
  }
  function onClose() {
    console.log(`DeribitOrderBook:${symbol} connection close.`);
    deribitOrderBook.status = 'disconnected';
    const waitSeconds = 2 ** connectionCounter;
    if (waitSeconds >= 1024) {
      throw new Error(`DeribitOrderBook:${symbol} could not`
        + 'reconnect after several tries.');
    }
    setTimeout(() => {
      deribitOrderBook.disconnect();
      deribitOrderBook.connect();
    }, waitSeconds);
  }
  function onError(error) {
    console.log(`DeribitOrderBook:${symbol} connection error.`);
    console.log(error);
    deribitOrderBook.status = 'disconnected';
    if (error.message === 'Unexpected server response: 503'
      || error.message === 'Unexpected server response: 504') {
      return;
    }
    throw new Error(`DeribitOrderBook:${symbol} could not`
      + 'handle error thrown by websocket connection.');
  }
  function onMessage(message) {
    const messageParsed = JSON.parse(message);
    if (!messageParsed.params || !messageParsed.params.data) { return };
    const data = messageParsed.params.data;
    if (data.type === 'snapshot') {
      deribitOrderBook.status = 'connected';
      return snapshotOrderBook(data, deribitOrderBook);
    }
    if (prevChangeId && prevChangeId !== data.prev_change_id) {
      throw new Error(`DeribitOrderBook:${symbol} unsynchronized.`);
    }
    prevChangeId = data.change_id;
    lastUpdateTimestamp = Date.now();
    updateOrderBook(data, deribitOrderBook);
  }
  deribitWs.onOpen(onOpen);
  deribitWs.onClose(onClose);
  deribitWs.onError(onError);
  deribitWs.onMessage(onMessage);
  return deribitOrderBook;
};
