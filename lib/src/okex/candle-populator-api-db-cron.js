const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const OkexRest = require('@gabrielgrijalva/crypto-exchanges')
  .OkexRest;

let settings = null;
let okexRestClient = null;
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
  const connection = mysql.createConnection(config);
  setInterval(() => connection.ping(), 3600000);
  return connection;
};
function getOkexRest() {
  return OkexRest(settings.OKEX_API_KEY,
    settings.OKEX_API_SECRET);
};
async function getOkexLastCandles() {
  const params = {};
  params.instrument_id = settings.OKEX_SYMBOL;
  params.granularity = settings.OKEX_INTERVAL;
  params.limit = '300';
  try {
    if (settings.OKEX_MARKET_TYPE === 'spot') {
      return (await okexRestClient
        .getSpotInstrumentsInstrumentIdHistoryCandles(settings.OKEX_SYMBOL, params));
    }
    if (settings.OKEX_MARKET_TYPE === 'futures') {
      return (await okexRestClient
        .getFuturesInstrumentsInstrumentIdHistoryCandles(settings.OKEX_SYMBOL, params));
    }
    if (settings.OKEX_MARKET_TYPE === 'perpetual') {
      return (await okexRestClient
        .getSwapInstrumentsInstrumentIdHistoryCandles(settings.OKEX_SYMBOL, params));
    }
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const okexLastCandles = await getOkexLastCandles();
  const okexLastCandle = okexLastCandles.find(candle => moment
    .utc(candle[0]).format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!okexLastCandle || !(+okexLastCandle[5])) { return getCandle(timestamp) };
  const candle = {};
  candle.timestamp = moment(okexLastCandle[0]).utc()
    .format('YYYY-MM-DD HH:mm:ss');
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
