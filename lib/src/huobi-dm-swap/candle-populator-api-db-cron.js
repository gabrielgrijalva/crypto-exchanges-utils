const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
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
async function getHuobiLastCandles() {
  const params = {};
  params.contract_code = settings.HUOBI_SYMBOL;
  params.period = settings.HUOBI_PERIOD;
  params.size = 5;
  try {
    return (await huobiRestClient.getSwapMarketHistoryKline(params));
  } catch (err) {
    throw err;
  }
};
async function getCandle(timestamp) {
  const huobiLastCandles = await getHuobiLastCandles();
  const huobiLastCandle = huobiLastCandles.data.find(candle => moment
    .unix(candle.id).utc().format('YYYY-MM-DD HH:mm:ss') === timestamp);
  if (!huobiLastCandle || !huobiLastCandle.vol) { return };
  const candle = {};
  candle.timestamp = moment.unix(huobiLastCandle.id).utc()
    .format('YYYY-MM-DD HH:mm:ss');
  candle.open = huobiLastCandle.open;
  candle.high = huobiLastCandle.high;
  candle.low = huobiLastCandle.low;
  candle.close = huobiLastCandle.close;
  candle.volume = huobiLastCandle.vol;
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
  settings = settingsInfo;
  huobiRestClient = getHuobiSwapRest(settingsInfo);
  connectionClient = getConnection(settingsInfo);
  new CronJob('00 * * * * *', async () => {
    console.log('Initialized candles populator.');
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
