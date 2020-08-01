const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const BitflyerWs = require('@gabrielgrijalva/crypto-exchanges').BitflyerWs;
const BitflyerRest = require('@gabrielgrijalva/crypto-exchanges').BitflyerRest;
const round = require('../../utils/round');

let settings = null;
let lastCandleInfo = null;
let currentCandleInfo = null;
let connectionClient = null;
let bitflyerWsClient = null;
let bitflyerRestClient = null;

const CandlePopulatorApiDbCron = {};

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
  const currentCandleInfo = {};
  currentCandleInfo.interval = round.down(moment.utc().unix() / settings
    .CANDLES_INTERVAL, 0);
  currentCandleInfo.timestamp = moment.unix(currentCandleInfo.interval
    * settings.CANDLES_INTERVAL).utc().format('YYYY-MM-DD HH:mm:ss');
  currentCandleInfo.open = null;
  currentCandleInfo.high = null;
  currentCandleInfo.low = null;
  currentCandleInfo.close = null;
  currentCandleInfo.volume = 0;
  return currentCandleInfo;
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
};
function getCandle(candleInfo) {
  const candle = {};
  candle.timestamp = candleInfo.timestamp;
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
     ON DUPLICATE KEY UPDATE open = VALUES(open), high = VALUES(high), 
     low = VALUES(low), close = VALUES(close), volume = VALUES(volume)`;
    connectionClient.query(query, [candle], (err) => {
      if (err) {
        console.log(err);
        throw new Error('Error when saving candle to database.');
      }
      resolve();
    });
  });
};
async function bitflyerGetExecutions(lastTrade) {
  const params = {};
  params.count = 500;
  params.product_code = settings.BITFLYER_SYMBOL;
  if (lastTrade) { params.before = lastTrade.id };
  try {
    return (await bitflyerRestClient.getExecutions(params));
  } catch (err) {
    if (err.Message === 'An error has occurred.') {
      return bitflyerGetExecutions(lastTrade);
    }
    throw err;
  }
};
async function syncCandlePreviousTrades() {
  let lastExecution = null;
  while (!lastExecution || moment.utc(lastExecution.exec_date).unix()
    >= moment.utc(currentCandleInfo.timestamp).unix()) {
    const executions = await bitflyerGetExecutions(lastExecution);
    for (let i = 0; i < executions.length; i += 1) {
      const execution = executions[i];
      const executionInterval = round.down(moment.utc(execution.exec_date)
        .unix() / settings.CANDLES_INTERVAL, 0);
      if (executionInterval === currentCandleInfo.interval) {
        parseTrade(execution, currentCandleInfo)
      }
      if ((i + 1) === executions.length) {
        lastExecution = execution
      };
    }
    await wait(1000);
  }
  console.log('Finished synchronizing candles.');
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
    const tradeInterval = round.down(moment.utc(trade.exec_date).unix()
      / settings.CANDLES_INTERVAL, 0);
    if (tradeInterval === currentCandleInfo.interval) {
      parseTrade(trade, currentCandleInfo);
    }
    if (lastCandleInfo && tradeInterval === lastCandleInfo.interval) {
      parseTrade(trade, lastCandleInfo);
    }
  });
};
CandlePopulatorApiDbCron.run = function (pSettings) {
  console.log('Initialized candles populator.');
  settings = pSettings;
  currentCandleInfo = createNewCandleInfo();
  connectionClient = getConnection(pSettings);
  bitflyerWsClient = getBitflyerWsClient(pSettings);
  bitflyerRestClient = getBitflyerRestClient();
  syncCandlePreviousTrades();
  new CronJob('00 * * * * *', () => {
    const timestamp = moment.utc();
    if (timestamp.unix() % settings.CANDLES_INTERVAL !== 0) { return };
    if (currentCandleInfo) {
      const candle = getCandle(currentCandleInfo);
      saveCandle(candle);
      console.log(`Saved ${candle.timestamp}`);
    }
    if (lastCandleInfo) {
      const lastCandle = getCandle(lastCandleInfo);
      saveCandle(lastCandle);
    }
    lastCandleInfo = currentCandleInfo;
    currentCandleInfo = createNewCandleInfo();
  }, () => { }, true);
  bitflyerWsClient.connect();
  bitflyerWsClient.onOpen(onOpenFunction);
  bitflyerWsClient.onClose(onCloseFunction);
  bitflyerWsClient.onError(onErrorFunction);
  bitflyerWsClient.onMessage(onMessageFunction);
}
module.exports = CandlePopulatorApiDbCron;
