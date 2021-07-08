const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const KrakenFuturesRest = require('@gabrielgrijalva/crypto-exchanges')
  .KrakenFuturesRest;
const wait = require('../../utils/wait');

let settings = null;
let connectionClient = null;
let krakenRestClient = null;

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
function getKrakenFuturesRest() {
  return KrakenFuturesRest(settings.KRAKEN_API_KEY,
    settings.KRAKEN_API_SECRET);
};
async function getKrakenLastCandles(timestamp) {
  const params = {};
  params.to = moment.utc(timestamp).add(settings.CANDLES_INTERVAL, 'seconds').unix();
  params.from = moment.utc(timestamp).subtract(settings.CANDLES_INTERVAL, 'seconds').unix();
  params.symbol = settings.KRAKEN_SYMBOL;
  params.interval = settings.KRAKEN_INTERVAL;
  try {
    return (await krakenRestClient.getChartsTrade(params));
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const krakenLastCandles = (await getKrakenLastCandles(timestamp)).candles;
  const krakenLastCandle = krakenLastCandles.find(candle => moment(
    candle.time).utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!krakenLastCandle || !(+krakenLastCandle.volume)) {
    await wait(2000);
    return getCandle(timestamp);
  }
  const candle = {};
  candle.timestamp = moment(krakenLastCandle.time).utc()
    .format('YYYY-MM-DD HH:mm:ss');
  candle.open = +krakenLastCandle.open;
  candle.high = +krakenLastCandle.high;
  candle.low = +krakenLastCandle.low;
  candle.close = +krakenLastCandle.close;
  candle.volume = +krakenLastCandle.volume;
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
  krakenRestClient = getKrakenFuturesRest(settingsInfo);
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
