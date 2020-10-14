const mysql = require('mysql');
const moment = require('moment');
const BinanceRest = require('@gabrielgrijalva/crypto-exchanges')
  .BinanceFuturesRest;

let settings = null;
let binanceRestClient = null;
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
function getBinanceRest() {
  return BinanceRest(settings.BINANCE_API_KEY, settings
    .BINANCE_API_SECRET);
};
async function getBinanceCandles(start, finish) {
  const params = {};
  params.symbol = settings.BINANCE_SYMBOL;
  params.interval = settings.BINANCE_INTERVAL;
  params.startTime = start;
  params.endTime = finish;
  params.limit = 1500;
  try {
    return (await binanceRestClient.getKlines(params));
  } catch (err) {
    throw err;
  }
};
async function getCandles(start, finish) {
  const candles = [];
  const candlesInfo = await getBinanceCandles(start, finish);
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
  binanceRestClient = getBinanceRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    let finish = start.clone().add(1500 * settingsInfo.CANDLES_INTERVAL, 'seconds');
    finish = finish.unix() < candlesFinish.unix() ? finish : candlesFinish;
    const candles = await getCandles(start.valueOf(), finish.valueOf());
    if (candles.length) {
      await saveCandles(candles);
    }
    console.log(`Saved ${finish.format('YYYY-MM-DD HH:mm:ss')}`);
    start = finish.clone().add(settingsInfo.CANDLES_INTERVAL, 'seconds');
  }
  console.log('Finished saving candles.');
}
module.exports = CandlePopulatorApiDbCron;
