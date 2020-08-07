const mysql = require('mysql');
const moment = require('moment');
const BitflyerWs = require('@gabrielgrijalva/crypto-exchanges').BitflyerWs;
const BitflyerRest = require('@gabrielgrijalva/crypto-exchanges').BitflyerRest;
const round = require('../../utils/round');

let settings = null;
let initialTradeId = null;
let currentCandleInfo = null;
let connectionClient = null;
let bitflyerWsClient = null;
let bitflyerRestClient = null;
const bitflyerTradesBuffer = [];

const RenkoPopulatorApiDbCron = {};

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(() => resolve(), milliseconds));
};
function getConnection() {
  const config = {};
  config.port = settings.DATABASE_PORT;
  config.host = settings.DATABASE_HOST;
  config.user = settings.DATABASE_USER;
  config.timezone = 'Z';
  config.database = settings.DATABASE_NAME;
  config.password = settings.DATABASE_PASSWORD;
  const connection = mysql.createConnection(config);
  setInterval(() => connection.ping(), 3600000);
  return connection;
};
function getBitflyerWsClient() {
  const config = {};
  config.channelName = `lightning_executions_${settings.BITFLYER_SYMBOL}`;
  return BitflyerWs(config);
};
function getBitflyerRestClient() {
  return BitflyerRest('', '');
};
function createNewCandleInfo() {
  const candleInfo = {};
  candleInfo.low = 0;
  candleInfo.open = 0;
  candleInfo.high = 0;
  candleInfo.close = 0;
  candleInfo.volume = 0;
  candleInfo.spreadRef = 0;
  candleInfo.timestamp = '';
  candleInfo.openTradeId = 0;
  candleInfo.closeTradeId = 0;
  return candleInfo;
};
function parseTrade(trade, candleInfo) {
  candleInfo.open = !candleInfo.open || trade.id < candleInfo
    .open.id ? trade : candleInfo.open;
  candleInfo.high = !candleInfo.high || trade.price > candleInfo
    .high.price ? trade : candleInfo.high;
  candleInfo.low = !candleInfo.low || trade.price < candleInfo
    .low.price ? trade : candleInfo.low;
  candleInfo.close = !candleInfo.close || trade.id > candleInfo
    .close.id ? trade : candleInfo.close;
  candleInfo.volume = round.normal(candleInfo.volume + trade.size, 8);
  candleInfo.timestamp = candleInfo.close ? moment.utc(candleInfo.close
    .exec_date).format('YYYY-MM-DD HH:mm:ss') : '';
  candleInfo.spreadRef = candleInfo.spreadRef ? candleInfo.spreadRef
    : round.normal(candleInfo.open.price * settings.CANDLE_SPREAD_PER, 0);
  candleInfo.openTradeId = candleInfo.openTradeId ? candleInfo.openTradeId
    : candleInfo.open.id;
  candleInfo.closeTradeId = candleInfo.close ? candleInfo.close.id : 0;
};
function getCandle(candleInfo) {
  const candle = {};
  candle.openTradeId = candleInfo.openTradeId ? candleInfo.openTradeId : 0
  candle.closeTradeId = candleInfo.closeTradeId ? candleInfo.closeTradeId : 0
  candle.timestamp = candleInfo.timestamp ? candleInfo.timestamp : 0;
  candle.open = candleInfo.open ? candleInfo.open.price : 0;
  candle.high = candleInfo.high ? candleInfo.high.price : 0;
  candle.low = candleInfo.low ? candleInfo.low.price : 0;
  candle.close = candleInfo.close ? candleInfo.close.price : 0;
  candle.volume = candleInfo.volume ? candleInfo.volume : 0;
  return candle.volume ? candle : null;
};
function saveCandle(candle) {
  return new Promise(resolve => {
    const query = `INSERT INTO ${settings.CANDLES_TABLE} SET ?
     ON DUPLICATE KEY UPDATE timestamp = VALUES(timestamp), open = VALUES(open), 
     high = VALUES(high), low = VALUES(low), close = VALUES(close), volume = VALUES(volume)`;
    connectionClient.query(query, [candle], (err) => {
      if (err) {
        console.log(err);
        throw new Error('Error when saving candle to database.');
      }
      resolve();
    });
  });
};
function getLastDbCandleInfo() {
  return new Promise(resolve => {
    const query = `SELECT * FROM ${settings.CANDLES_TABLE} 
      ORDER BY timestamp DESC LIMIT 1`;
    connectionClient.query(query, (err, results) => {
      if (err) {
        console.log(err);
        throw new Error('Error when saving candle to database.');
      }
      resolve(results[0]);
    });
  });
}
async function bitflyerGetExecutions(params) {
  try {
    return (await bitflyerRestClient.getExecutions(params));
  } catch (err) {
    if (err.Message === 'An error has occurred.') {
      return bitflyerGetExecutions(params);
    }
    throw err;
  }
};
async function getTrades(beforeId, prevBeforeId) {
  const params = {};
  params.count = 500;
  params.before = beforeId;
  params.product_code = settings.BITFLYER_SYMBOL;
  const trades = await bitflyerGetExecutions(params);
  return trades.reverse().filter(v => v.id >= prevBeforeId);
}
async function syncRenkoCandles() {
  console.log('Synchronizing renko candles');
  let candleInfo = createNewCandleInfo();
  let lastDbCandleInfo = await getLastDbCandleInfo();
  let prevBeforeId = lastDbCandleInfo ? lastDbCandleInfo
    .closeTradeId : settings.BITFLYER_BEFORE_TRADE_ID;
  let beforeId = prevBeforeId + 500;
  while (beforeId <= initialTradeId && prevBeforeId !== beforeId) {
    const trades = await getTrades(beforeId, prevBeforeId);
    for (let i = 0; trades[i]; i += 1) {
      parseTrade(trades[i], candleInfo);
      const closeCurrentCandlePriceRef = Math.abs(candleInfo.close.price
        - candleInfo.open.price) >= candleInfo.spreadRef;
      const closeCurrentCandleMinTime = moment.utc(candleInfo.close.exec_date).valueOf()
        - moment.utc(candleInfo.open.exec_date).valueOf() >= settings.CANDLE_MIN_TIME;
      if (closeCurrentCandlePriceRef && closeCurrentCandleMinTime) {
        const candle = getCandle(candleInfo);
        await saveCandle(candle);
        candleInfo = createNewCandleInfo();
        console.log(`Saved candle ${candle.timestamp}`);
      }
    }
    prevBeforeId = beforeId;
    beforeId = prevBeforeId + 500;
    beforeId = beforeId < initialTradeId ? beforeId : initialTradeId;
    await wait(1000);
  }
  console.log('Synchronized renko candles.');
  currentCandleInfo = createNewCandleInfo();
  onMessageFunction(bitflyerTradesBuffer.splice(0));
};
function onOpenFunction() {
  console.log('Bitlfyer executions connection opened.');
};
function onCloseFunction() {
  console.log('Bitlfyer executions connection closed.');
  bitflyerWsClient.disconnect();
  bitflyerWsClient.connect();
};
function onErrorFunction() {
  console.log('Bitflyer executions connection error.');
  console.log(error);
};
function onMessageFunction(message) {
  const messageParsed = message;
  if (!Array.isArray(messageParsed)) { return };
  messageParsed.forEach(trade => {
    if (!initialTradeId) {
      initialTradeId = trade.id;
      syncRenkoCandles();
    }
    if (!currentCandleInfo) {
      return bitflyerTradesBuffer.push(trade);
    }
    parseTrade(trade, currentCandleInfo);
    const closeCurrentCandlePriceRef = Math.abs(currentCandleInfo.close.price
      - currentCandleInfo.open.price) >= currentCandleInfo.spreadRef;
    const closeCurrentCandleMinTime = moment.utc(currentCandleInfo.close.exec_date).valueOf()
      - moment.utc(currentCandleInfo.open.exec_date).valueOf() >= settings.CANDLE_MIN_TIME;
    if (closeCurrentCandlePriceRef && closeCurrentCandleMinTime) {
      const candle = getCandle(currentCandleInfo);
      saveCandle(candle);
      currentCandleInfo = createNewCandleInfo();
      console.log(`Saved candle ${candle.timestamp}`);
    }
  });
};
RenkoPopulatorApiDbCron.run = async function (pSettings) {
  console.log('Initialized renko populator.');
  settings = pSettings;
  connectionClient = getConnection(pSettings);
  bitflyerWsClient = getBitflyerWsClient(pSettings);
  bitflyerRestClient = getBitflyerRestClient();
  bitflyerWsClient.connect();
  bitflyerWsClient.onOpen(onOpenFunction);
  bitflyerWsClient.onClose(onCloseFunction);
  bitflyerWsClient.onError(onErrorFunction);
  bitflyerWsClient.onMessage(onMessageFunction);
}
module.exports = RenkoPopulatorApiDbCron;
