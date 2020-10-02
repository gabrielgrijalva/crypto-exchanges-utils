const mysql = require('mysql');
const moment = require('moment');
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
async function getBybitCandles(start) {
  const params = {};
  params.symbol = settings.BYBIT_SYMBOL;
  params.interval = settings.BYBIT_INTERVAL;
  params.from = start;
  params.limit = 200;
  try {
    return (await bybitRestClient.getPublicKlineList(params));
  } catch (err) {
    throw err;
  }
};
async function getCandles(start) {
  const candles = [];
  const candlesInfo = (await getBybitCandles(start)).result;
  for (let i = 0; candlesInfo[i]; i += 1) {
    const candle = [];
    candle[0] = moment.unix(candlesInfo[i].open_time).utc()
      .format('YYYY-MM-DD HH:mm:ss');
    candle[1] = +candlesInfo[i].open;
    candle[2] = +candlesInfo[i].high;
    candle[3] = +candlesInfo[i].low;
    candle[4] = +candlesInfo[i].close;
    candle[5] = +candlesInfo[i].volume;
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
  bybitRestClient = getBybitRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    const candles = await getCandles(start.unix());
    if (candles.length) {
      await saveCandles(candles);
    }
    start = moment.utc(!candles.length ? start : candles[candles
      .length - 1][0]).add(settings.CANDLES_INTERVAL, 'seconds');
    console.log(`Saved ${start.format('YYYY-MM-DD HH:mm:ss')}`);
  }
  console.log('Finished saving candles.');
}
module.exports = CandlePopulatorApiDbCron;
