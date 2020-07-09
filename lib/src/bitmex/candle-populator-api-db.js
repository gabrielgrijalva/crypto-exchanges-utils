const mysql = require('mysql');
const moment = require('moment');
const BitmexSwapRest = require('@gabrielgrijalva/crypto-exchanges')
  .BitmexRest;

let settings = null;
let bitmexRestClient = null;
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
function getBitmexRest() {
  return BitmexSwapRest(settings.BITMEX_API_KEY,
    settings.BITMEX_API_SECRET);
};
async function getBitmexCandles(start, finish) {
  const params = {};
  params.symbol = settings.BITMEX_SYMBOL;
  params.resolution = settings.BITMEX_RESOLUTION;
  params.from = start;
  params.to = finish;
  try {
    return (await bitmexRestClient.getUDFHistory(params));
  } catch (err) {
    throw err;
  }
};
async function getCandles(start, finish) {
  const candles = [];
  const candlesInfo = await getBitmexCandles(start, finish);
  for (let i = 1; candlesInfo.t[i]; i += 1) {
    const candle = [];
    candle[0] = moment.unix(candlesInfo.t[i]).utc().format('YYYY-MM-DD HH:mm:ss');
    candle[1] = +candlesInfo.o[i];
    candle[2] = +candlesInfo.h[i];
    candle[3] = +candlesInfo.l[i];
    candle[4] = +candlesInfo.c[i];
    candle[5] = +candlesInfo.v[i];
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
  bitmexRestClient = getBitmexRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    let finish = start.clone().add(10080 * settingsInfo.CANDLES_INTERVAL, 'seconds');
    finish = finish.unix() < candlesFinish.unix() ? finish : candlesFinish;
    const candles = await getCandles(start.unix(), finish.unix());
    if (candles.length) {
      await saveCandles(candles);
    }
    console.log(`Saved ${finish.format('YYYY-MM-DD HH:mm:ss')}`);
    start = finish.clone().add(settingsInfo.CANDLES_INTERVAL, 'seconds');
  }
  console.log('Finished saving candles.');
}
module.exports = CandlePopulatorApiDbCron;
