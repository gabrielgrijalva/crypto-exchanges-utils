const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const BitflyerWs = require('@gabrielgrijalva/crypto-exchanges')
  .BitflyerWs;
const round = require('../../utils/round');

let settings = null;
let connectionClient = null;
let bitflyerWsClient = null;

const CandlePopulatorApiDbCron = {};

function getConnection() {
  const config = {};
  config.port = settings.DATABASE_PORT;
  config.host = settings.DATABASE_HOST;
  config.user = settings.DATABASE_USER;
  config.timezone = 'Z';
  config.database = settings.DATABASE_NAME;
  config.password = settings.DATABASE_PASSWORD;
  return mysql.createConnection(config);
};
function getBitflyerWsClient() {
  const config = {};
  config.channelName = `lightning_executions_${settings.BITFLYER_SYMBOL}`;
  return BitflyerWs(config);
};
function getCandle(candleInfo) {
  const candle = candleInfo.trades.sort((a, b) => a.id - b.id).reduce((candle, trade, i) => {
    candle.open = candle.open ? candle.open : trade.price;
    candle.high = candle.high ? (trade.price > candle.high
      ? trade.price : candle.high) : trade.price;
    candle.low = candle.low ? (trade.price < candle.low
      ? trade.price : candle.low) : trade.price;
    candle.close = trade.price;
    candle.volume = round.normal(candle.volume + trade.size, 8);
    return candle;
  }, { timestamp: candleInfo.timestamp, open: 0, high: 0, low: 0, close: 0, volume: 0 });
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
function checkMaintenanceHours() {
  return settings.MAINTENANCE_HOURS.find(maintenanceHour => {
    const timestamp = moment.utc().unix();
    const maintenanceHourArr = maintenanceHour.split('-');
    const maintenanceHourStartArr = maintenanceHourArr[0].split(':');
    const maintenanceHourFinishArr = maintenanceHourArr[1].split(':');
    const maintenanceHourStartTimestamp = moment.utc().startOf('day').set('hour',
      maintenanceHourStartArr[0]).set('minute', maintenanceHourStartArr[1]).unix();
    const maintenanceHourFinishTimestamp = moment.utc().startOf('day').set('hour',
      maintenanceHourFinishArr[0]).set('minute', maintenanceHourFinishArr[1]).unix();
    return timestamp >= maintenanceHourStartTimestamp && timestamp
      <= maintenanceHourFinishTimestamp;
  });
};
CandlePopulatorApiDbCron.run = function (pSettings) {
  console.log('Initialized candles populator.');
  settings = pSettings;
  connectionClient = getConnection(pSettings);
  bitflyerWsClient = getBitflyerWsClient(pSettings);
  let candleInfo = {};
  candleInfo.trades = [];
  candleInfo.interval = 0;
  candleInfo.timestamp = '';
  let lastCandleInfo = {};
  lastCandleInfo.trades = [];
  lastCandleInfo.interval = 0;
  lastCandleInfo.timestamp = '';
  new CronJob('00 * * * * *', async () => {
    const timestamp = moment.utc();
    if (timestamp.unix() % settings.CANDLES_INTERVAL !== 0) { return };
    const maintenance = checkMaintenanceHours();
    const candleTimestamp = moment.unix((timestamp.unix() / settings
      .CANDLES_INTERVAL - 1) * settings.CANDLES_INTERVAL).utc()
      .format('YYYY-MM-DD HH:mm:ss');
    const candle = getCandle(candleInfo);
    const lastCandle = getCandle(lastCandleInfo);
    if (candle) {
      await saveCandle(candle);
      console.log(`Saved ${candleTimestamp}`);
    }
    if (lastCandle) {
      await saveCandle(lastCandle);
    }
    lastCandleInfo = candleInfo;
    candleInfo = {};
    candleInfo.trades = [];
    candleInfo.interval = timestamp.unix() / settings.CANDLES_INTERVAL;
    candleInfo.timestamp = moment.unix(candleInfo.interval * settings
      .CANDLES_INTERVAL).utc().format('YYYY-MM-DD HH:mm:ss');
    if (maintenance) {
      if (bitflyerWsClient.ws) {
        bitflyerWsClient.disconnect();
      }
    }
    if (!maintenance) {
      if (!bitflyerWsClient.ws) {
        bitflyerWsClient.connect();
      }
    }
  }, () => { }, true);
  bitflyerWsClient.onOpen(() => {
    console.log('Bitlfyer executions connection opened.');
  });
  bitflyerWsClient.onClose(() => {
    console.log('Bitlfyer executions connection closed.');
    bitflyerWsClient.disconnect();
    bitflyerWsClient.connect();
  });
  bitflyerWsClient.onError((error) => {
    console.log('Bitflyer executions connection error.');
    console.log(error);
  });
  bitflyerWsClient.onMessage(message => {
    const messageParsed = message;
    if (!Array.isArray(messageParsed)) { return };
    messageParsed.forEach(trade => {
      const tradeInterval = round.down(moment.utc(trade.exec_date).unix()
        / settings.CANDLES_INTERVAL, 0);
      if (tradeInterval === candleInfo.interval) {
        candleInfo.trades.push(trade);
      }
      if (tradeInterval === lastCandleInfo.interval) {
        candleInfo.trades.push(trade);
      }
    });
  });
}
module.exports = CandlePopulatorApiDbCron;
