const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const BitmexRest = require('@gabrielgrijalva/crypto-exchanges')
  .BitmexRest;
const round = require('../../utils/round');
const wait = require('../../utils/wait');

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
  const connection = mysql.createConnection(config);
  setInterval(() => connection.ping(), 3600000);
  return connection;
};
function getBitmexRest() {
  return BitmexRest(settings.BITMEX_API_KEY,
    settings.BITMEX_API_SECRET);
};
async function getBitmexLastCandles() {
  const params = {};
  params.symbol = settings.BITMEX_SYMBOL;
  params.resolution = settings.BITMEX_RESOLUTION;
  params.from = (round.down(moment.utc().unix() / settings.CANDLES_INTERVAL, 0) - 5)
    * settings.CANDLES_INTERVAL
  params.to = round.down(moment.utc().unix() / settings.CANDLES_INTERVAL, 0)
    * settings.CANDLES_INTERVAL;
  try {
    return (await bitmexRestClient.getUDFHistory(params));
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const bitmexLastCandles = await getBitmexLastCandles();
  const bitmexLastCandleIndex = bitmexLastCandles.t
    .findIndex(t => t === timestamp);
  if (bitmexLastCandleIndex === -1) {
    await wait(1000);
    return getCandle(timestamp);
  }
  const candle = {};
  candle.timestamp = moment.unix(bitmexLastCandles.t[bitmexLastCandleIndex])
    .utc().format('YYYY-MM-DD HH:mm:ss');
  candle.open = +bitmexLastCandles.o[bitmexLastCandleIndex];
  candle.high = +bitmexLastCandles.h[bitmexLastCandleIndex];
  candle.low = +bitmexLastCandles.l[bitmexLastCandleIndex];
  candle.close = +bitmexLastCandles.c[bitmexLastCandleIndex];
  candle.volume = +bitmexLastCandles.v[bitmexLastCandleIndex];
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
  bitmexRestClient = getBitmexRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  new CronJob('00 * * * * *', async () => {
    const timestamp = moment.utc();
    if (timestamp.unix() % settings.CANDLES_INTERVAL !== 0) { return };
    const candleTimestamp = moment.unix((moment.utc().unix() / settings
      .CANDLES_INTERVAL - 1) * settings.CANDLES_INTERVAL).utc().unix();
    const candle = await getCandle(candleTimestamp);
    if (candle) {
      await saveCandle(candle);
      console.log(`Saved ${moment.unix(candleTimestamp).utc()
        .format('YYYY-MM-DD HH:mm:ss')}`);
    }
  }, () => { }, true);
}
module.exports = CandlePopulatorApiDbCron;
