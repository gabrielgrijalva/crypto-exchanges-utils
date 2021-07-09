const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const OneForgeRest = require('@gabrielgrijalva/crypto-exchanges').OneForge;
const wait = require('../../utils/wait');

let settings = null;
let connectionClient = null;
let oneForgeRestClient = null;

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
function getOneForgeRest() {
  return OneForgeRest(settings.ONE_FORGE_API_KEY);
};
async function getOneForgeLastQuote() {
  const params = {};
  params.pairs = settings.ONE_FORGE_SYMBOL;
  try {
    return (await oneForgeRestClient.getQuotes(params));
  } catch (err) {
    console.log(err);
    return;
  }
};
async function getCandle(timestamp) {
  const lastQuote = await getOneForgeLastQuote();
  if (!lastQuote[0] || !lastQuote[0].p) {
    await wait(1000);
    return getCandle();
  };
  const candle = {};
  candle.timestamp = moment.utc(timestamp).format('YYYY-MM-DD HH:mm:ss');
  candle.open = 0;
  candle.high = 0;
  candle.low = 0;
  candle.close = lastQuote[0].p;
  candle.volume = 0;
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
  oneForgeRestClient = getOneForgeRest(settingsInfo);
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
