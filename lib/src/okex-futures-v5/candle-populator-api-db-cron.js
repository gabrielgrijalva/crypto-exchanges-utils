const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const OkexRest = require('@gabrielgrijalva/crypto-exchanges')
  .OkexFuturesV5Rest;

let settings = null;
let okexRestClient = null;
let connectionClient = null;

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
function getOkexRest() {
  return OkexRest(settings.OKEX_API_KEY, settings.OKEX_API_SECRET,
    settings.OKEX_API_PASSPHRASE);
};
async function getOkexLastCandles() {
  const params = {};
  params.limit = '100';
  params.instId = settings.OKEX_SYMBOL;
  params.bar = settings.OKEX_INTERVAL;
  try {
    return (await okexRestClient.getMarketHistoryCandles(params)).data;
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const okexLastCandles = await getOkexLastCandles();
  if (!Array.isArray(okexLastCandles)) {
    await wait(500);
    return getCandle(timestamp);
  }
  const okexLastCandle = okexLastCandles.find(candle => moment(+candle[0])
    .utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!okexLastCandle || !(+okexLastCandle[5])) {
    await wait(500);
    return getCandle(timestamp);
  }
  const candle = {};
  candle.timestamp = moment(+okexLastCandle[0]).utc().format('YYYY-MM-DD HH:mm:ss');
  candle.open = +okexLastCandle[1];
  candle.high = +okexLastCandle[2];
  candle.low = +okexLastCandle[3];
  candle.close = +okexLastCandle[4];
  candle.volume = +okexLastCandle[5];
  return candle;
};
function saveCandle(candle) {
  return new Promise(resolve => {
    const query = `INSERT INTO ${settings.CANDLES_TABLE} SET ?`;
    connectionClient.query(query, [candle], (err) => {
      if (err) {
        console.log(err);
        throw new Error('Error when saving candle to database.');
      }
      resolve();
    });
  });
};

CandlePopulatorApiDbCron.run = function (settingsInfo) {
  console.log('Initialized candles populator.');
  settings = settingsInfo;
  okexRestClient = getOkexRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  new CronJob('00 * * * * *', async () => {
    const timestamp = moment.utc().subtract(settings.CANDLES_INTERVAL, 'seconds');
    if (timestamp.unix() % settings.CANDLES_INTERVAL !== 0) { return };
    const candle = await getCandle(timestamp.format('YYYY-MM-DD HH:mm:ss'));
    if (candle) {
      await saveCandle(candle);
      console.log(`Saved ${timestamp.format('YYYY-MM-DD HH:mm:ss')}`);
    }
  }, () => { }, true);
}
module.exports = CandlePopulatorApiDbCron;
