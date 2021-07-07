const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const DeribitRest = require('@gabrielgrijalva/crypto-exchanges').DeribitRest;
const wait = require('../../utils/wait');

let settings = null;
let connectionClient = null;
let deribitRestClient = null;

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
function getDeribitRest() {
  return DeribitRest(settings.DERIBIT_API_KEY,
    settings.DERIBIT_API_SECRET);
};
async function getDeribitCandles(timestamp) {
  const params = {};
  params.instrument_name = settings.DERIBIT_SYMBOL;
  params.start_timestamp = moment.utc(timestamp).valueOf();
  params.end_timestamp = moment.utc(timestamp).add(1, 'day').valueOf();
  params.resolution = settings.DERIBIT_RESOLUTION;
  try {
    return (await deribitRestClient.publicGetTradingviewChartData(params));
  } catch (err) {
    console.log('err');
    console.log(err);
    throw err;
  }
};
async function getCandle(timestamp) {
  const deribitLastCandles = (await getDeribitCandles(timestamp)).result;
  const deribitLastCandleIndex = deribitLastCandles.ticks.findIndex(tick =>
    moment(tick).utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (deribitLastCandleIndex === -1) {
    await wait(1000);
    return getCandle(timestamp);
  }
  const candle = {};
  candle.timestamp = moment(deribitLastCandles.ticks[deribitLastCandleIndex])
    .utc().format('YYYY-MM-DD HH:mm:ss');
  candle.open = +deribitLastCandles.open[deribitLastCandleIndex];
  candle.high = +deribitLastCandles.high[deribitLastCandleIndex];
  candle.low = +deribitLastCandles.low[deribitLastCandleIndex];
  candle.close = +deribitLastCandles.close[deribitLastCandleIndex];
  candle.volume = +deribitLastCandles.volume[deribitLastCandleIndex];
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
  deribitRestClient = getDeribitRest(settingsInfo);
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
