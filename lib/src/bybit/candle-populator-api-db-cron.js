const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const BybitRest = require('@gabrielgrijalva/crypto-exchanges')
  .BybitRest;

let settings = null;
let bybitRestClient = null;
let connectionClient = null;

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
function getBybitRest() {
  return BybitRest(settings.BYBIT_API_KEY, settings
    .BYBIT_API_SECRET);
};
async function getBybitCandles(timestamp) {
  const params = {};
  params.symbol = settings.BYBIT_SYMBOL;
  params.interval = settings.BYBIT_INTERVAL;
  params.from = timestamp;
  params.limit = 10;
  try {
    return (await bybitRestClient.getPublicKlineList(params));
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const bybitLastCandles = (await getBybitCandles(moment.utc(
    timestamp).unix())).result;
  const bybitLastCandle = bybitLastCandles.find(candle => moment.unix(
    candle.open_time).utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!bybitLastCandle || !(bybitLastCandle.volume)) {
    return getCandle(timestamp);
  }
  const candle = {};
  candle.timestamp = moment.unix(bybitLastCandle.open_time).utc()
    .format('YYYY-MM-DD HH:mm:ss');
  candle.open = +bybitLastCandle.open;
  candle.high = +bybitLastCandle.high;
  candle.low = +bybitLastCandle.low;
  candle.close = +bybitLastCandle.close;
  candle.volume = +bybitLastCandle.volume;
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
  connectionClient = getConnection(settingsInfo);
  bybitRestClient = getBybitRest(settingsInfo);
  new CronJob('00 * * * * *', async () => {
    const timestamp = moment.utc();
    if (timestamp.unix() % settings.CANDLES_INTERVAL !== 0) { return };
    const candleTimestamp = moment.unix((moment.utc().unix() / settings
      .CANDLES_INTERVAL - 1) * settings.CANDLES_INTERVAL).utc()
      .format('YYYY-MM-DD HH:mm:ss');
    const candle = await getCandle(candleTimestamp);
    if (candle) {
      await saveCandle(candle);
      console.log(`Saved ${candleTimestamp}`);
    }
  }, () => { }, true);
}
module.exports = CandlePopulatorApiDbCron;
