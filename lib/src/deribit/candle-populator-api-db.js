const mysql = require('mysql');
const moment = require('moment');
const DeribitRest = require('@gabrielgrijalva/crypto-exchanges').DeribitRest;

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
async function getDeribitCandles(start) {
  const params = {};
  params.instrument_name = settings.DERIBIT_SYMBOL;
  params.start_timestamp = moment.utc(start).valueOf();
  params.end_timestamp = moment.utc(start).add(1, 'day').valueOf();
  params.resolution = settings.DERIBIT_RESOLUTION;
  try {
    return (await deribitRestClient.publicGetTradingviewChartData(params));
  } catch (err) {
    throw err;
  }
};
async function getCandles(start) {
  const candles = [];
  const candlesInfo = (await getDeribitCandles(start)).result;
  for (let i = 0; candlesInfo.ticks[i]; i += 1) {
    const candle = [];
    candle[0] = moment.unix(candlesInfo.ticks[i]).utc()
      .format('YYYY-MM-DD HH:mm:ss');
    candle[1] = +candlesInfo.open[i];
    candle[2] = +candlesInfo.high[i];
    candle[3] = +candlesInfo.low[i];
    candle[4] = +candlesInfo.close[i];
    candle[5] = +candlesInfo.volume[i];
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
  deribitRestClient = getDeribitRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    const candles = await getCandles(start.format('YYYY-MM-DD HH:mm:ss'));
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
