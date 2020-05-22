const mysql = require('mysql');
const moment = require('moment');
const HuobiSwapRest = require('@gabrielgrijalva/crypto-exchanges')
  .HuobiDMSwapRest;

let settings = null;
let huobiRestClient = null;
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
function getHuobiSwapRest() {
  return HuobiSwapRest(settings.HUOBI_API_KEY,
    settings.HUOBI_API_SECRET);
};
async function getHuobiCandles(start, finish) {
  const params = {};
  params.contract_code = settings.HUOBI_SYMBOL;
  params.period = settings.HUOBI_PERIOD;
  params.from = start;
  params.to = finish;
  try {
    return (await huobiRestClient.getSwapMarketHistoryKline(params));
  } catch (err) {
    throw err;
  }
};
async function getCandles(start, finish) {
  return (await getHuobiCandles(start, finish)).data.filter(huobiCandle =>
    +huobiCandle.vol).map(huobiCandle => {
      return [
        moment.unix(huobiCandle.id).utc().format('YYYY-MM-DD HH:mm:ss'),
        huobiCandle.open,
        huobiCandle.high,
        huobiCandle.low,
        huobiCandle.close,
        huobiCandle.vol,
      ];
    });
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
  huobiRestClient = getHuobiSwapRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  let start = moment.utc(settingsInfo.CANDLES_START);
  const candlesFinish = moment.utc(settingsInfo.CANDLES_FINISH);
  while (start.unix() < candlesFinish.unix()) {
    let finish = start.clone().add(2000 * settingsInfo.CANDLES_INTERVAL, 'seconds');
    finish = finish.unix() < candlesFinish.unix() ? finish : candlesFinish;
    const candles = await getCandles(start.unix(), finish.unix());
    if (candles.length) {
      await saveCandles(candles);
    }
    console.log(`Saved ${start.format('YYYY-MM-DD HH:mm:ss')}`);
    start = finish.clone().add(settingsInfo.CANDLES_INTERVAL, 'seconds');
  }
  console.log('Finished saving candles.');
}
module.exports = CandlePopulatorApiDbCron;
