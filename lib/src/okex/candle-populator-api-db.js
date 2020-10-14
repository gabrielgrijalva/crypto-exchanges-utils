const mysql = require('mysql');
const moment = require('moment');
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
  return mysql.createConnection(config);
};
function getOkexRest() {
  return OkexRest(settings.OKEX_API_KEY, settings
    .OKEX_API_SECRET);
};
async function getOkexCandles(start, finish) {
  const params = {};
  params.instrument_id = settings.OKEX_SYMBOL;
  params.start = finish;
  params.end = start;
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
async function getOkexCandlesMinor() {
  const params = {};
  params.size = '1000';
  params.granularity = settings.OKEX_INTERVAL;
  try {
    if (settings.OKEX_MARKET_TYPE === 'spot') {
      return (await okexRestClient
        .getSpotInstrumentsInstrumentIdCandles(settings.OKEX_SYMBOL, params)).data;
    }
    if (settings.OKEX_MARKET_TYPE === 'futures') {
      return (await okexRestClient
        .getFuturesPcMarketInstrumentIdCandles(settings.OKEX_SYMBOL, params)).data;
    }
    if (settings.OKEX_MARKET_TYPE === 'perpetual') {
      return (await okexRestClient
        .getPerpetualPcPublicInstrumentsInstrumentIdCandles(settings.OKEX_SYMBOL, params)).data;
    }
  } catch (err) {
    throw err;
  }
};
async function getCandles(start, finish) {
  const candles = [];
  const candlesInfo = settings.OKEX_CURRENCY_TYPE === 'major'
    ? await getOkexCandles(start, finish) : await getOkexCandlesMinor();
  for (let i = 0; candlesInfo[i]; i += 1) {
    const candle = [];
    candle[0] = moment(candlesInfo[i][0]).utc().format('YYYY-MM-DD HH:mm:ss');
    candle[1] = +candlesInfo[i][1];
    candle[2] = +candlesInfo[i][2];
    candle[3] = +candlesInfo[i][3];
    candle[4] = +candlesInfo[i][4];
    candle[5] = +candlesInfo[i][5];
    if (candle[5]) { candles.push(candle) };
  }
  return candles;
};
function saveCandles(candles) {
  return new Promise(resolve => {
    const query = `INSERT INTO ${settings.CANDLES_TABLE} (timestamp, open, 
      high, low, close, volume) VALUES ? ON DUPLICATE KEY UPDATE timestamp
      = VALUES(timestamp)`;
    connectionClient.query(query, [candles], (err) => {
      if (err) {
        console.log(err);
        throw new Error('Error when saving candles to database.');
      }
      resolve();
    });
  });
};

CandlePopulatorApiDbCron.run = async function (settingsInfo) {
  console.log('Initialized candles populator.');
  settings = settingsInfo;
  okexRestClient = getOkexRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    let finish = start.clone().add(300 * settingsInfo.CANDLES_INTERVAL, 'seconds');
    finish = finish.unix() < candlesFinish.unix() ? finish : candlesFinish;
    const candles = await getCandles(start.format(), finish.format());
    if (candles.length) {
      await saveCandles(candles);
    }
    console.log(`Saved ${finish.format('YYYY-MM-DD HH:mm:ss')}`);
    start = finish.clone().add(settingsInfo.CANDLES_INTERVAL, 'seconds');
  }
  console.log('Finished saving candles.');
}
module.exports = CandlePopulatorApiDbCron;
