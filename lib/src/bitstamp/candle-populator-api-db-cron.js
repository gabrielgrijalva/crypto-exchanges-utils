const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const BitstampRest = require('@gabrielgrijalva/crypto-exchanges')
  .BitstampRest;

let settings = null;
let connectionClient = null;
let bitstampRestClient = null;

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
function getBitstampRest() {
  return BitstampRest(settings.BITSTAMP_API_KEY,
    settings.BITSTAMP_API_SECRET);
};
async function getBitstampLastCandles() {
  const params = {};
  params.step = settings.BITSTAMP_STEP;
  params.pair = settings.BITSTAMP_PAIR;
  params.limit = 5;
  try {
    return (await bitstampRestClient.getOHLC(params));
  } catch (err) {
    console.log(err);
    return;
  }
};
async function getCandle(timestamp) {
  const bitstampLastCandles = await getBitstampLastCandles();
  if (!bitstampLastCandles || !bitstampLastCandles.data.ohlc.length) { return };
  const bitstampLastCandle = bitstampLastCandles.data.ohlc.find(v => moment
    .unix(+v.timestamp).utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!bitstampLastCandle || !(+bitstampLastCandle.volume)) { return };
  const candle = {};
  candle.timestamp = moment.unix(+bitstampLastCandle.timestamp)
    .utc().format('YYYY-MM-DD HH:mm:ss');
  candle.open = +bitstampLastCandle.open;
  candle.high = +bitstampLastCandle.high;
  candle.low = +bitstampLastCandle.low;
  candle.close = +bitstampLastCandle.close;
  candle.volume = +bitstampLastCandle.volume;
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
  bitstampRestClient = getBitstampRest(settingsInfo);
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
