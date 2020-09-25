const mysql = require('mysql');
const moment = require('moment');
const KrakenRest = require('@gabrielgrijalva/crypto-exchanges')
  .KrakenFuturesRest;

let settings = null;
let krakenRestClient = null;
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
function getKrakenRest() {
  return KrakenRest(settings.KRAKEN_API_KEY, settings
    .KRAKEN_API_SECRET);
};
async function getKrakenCandles(start, finish) {
  const params = {};
  params.symbol = settings.KRAKEN_SYMBOL;
  params.interval = settings.KRAKEN_INTERVAL;
  params.from = start;
  params.to = finish;
  try {
    return (await krakenRestClient.getChartsTrade(params));
  } catch (err) {
    throw err;
  }
};
async function getCandles(start, finish) {
  const candles = [];
  const candlesInfo = (await getKrakenCandles(start, finish)).candles;
  for (let i = 0; candlesInfo[i]; i += 1) {
    const candle = [];
    candle[0] = moment(candlesInfo[i].time).utc().format('YYYY-MM-DD HH:mm:ss');
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
  krakenRestClient = getKrakenRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    let finish = start.clone().add(5000 * settingsInfo.CANDLES_INTERVAL, 'seconds');
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
