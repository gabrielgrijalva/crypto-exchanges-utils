const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const BinanceFuturesRest = require('@gabrielgrijalva/crypto-exchanges')
  .BinanceFuturesRest;

let settings = null;
let connectionClient = null;
let binanceRestClient = null;

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
function getBinanceFuturesRest() {
  return BinanceFuturesRest(settings.BINANCE_API_KEY,
    settings.BINANCE_API_SECRET);
};
async function getBinanceLastCandles() {
  const params = {};
  params.symbol = settings.BINANCE_SYMBOL;
  params.interval = settings.BINANCE_INTERVAL;
  params.limit = 5;
  try {
    return (await binanceRestClient.getKlines(params));
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const binanceLastCandles = await getBinanceLastCandles();
  const binanceLastCandle = binanceLastCandles.find(candle => moment(
    candle[0]).utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!binanceLastCandle || !(+binanceLastCandle[5])) { return };
  const candle = {};
  candle.timestamp = moment(binanceLastCandle[0]).utc()
    .format('YYYY-MM-DD HH:mm:ss');
  candle.open = +binanceLastCandle[1];
  candle.high = +binanceLastCandle[2];
  candle.low = +binanceLastCandle[3];
  candle.close = +binanceLastCandle[4];
  candle.volume = +binanceLastCandle[5];
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
  binanceRestClient = getBinanceFuturesRest(settingsInfo);
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
